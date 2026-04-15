// 学习页逻辑 — 字表数据由 data/*.json 提供（需 HTTP 访问，见 README）
let HANZI_META = {};
let CATEGORIES = [];

async function loadLearnData() {
  const base = typeof getAppBaseUrl === "function" ? getAppBaseUrl() : new URL(".", window.location.href);
  const metaUrl = new URL("data/hanzi-meta.json", base);
  const catUrl = new URL("data/categories.json", base);
  const [rm, rc] = await Promise.all([fetch(metaUrl), fetch(catUrl)]);
  if (!rm.ok || !rc.ok) {
    throw new Error("无法加载字表数据，请使用本地 HTTP 服务打开站点（见 README）");
  }
  HANZI_META = await rm.json();
  CATEGORIES = await rc.json();
}

function syncStateFromProgressStore() {
  const p = ProgressStore.load();
  state.stars = p.stars;
  state.learned = p.learned;
  state.streak = p.streak;
}

function bindLearnDelegatedEvents() {
  var catList = document.getElementById("categoryList");
  var grid = document.getElementById("hanziGrid");
  // 移动端（尤其 iOS Safari）在 touch 后约 300ms 才触发 click，语音合成不再视为用户手势会静音。
  // 使用 pointerup：手指抬起时仍在同一次手势内，与 Voice.speakChar 同步调用配套。
  var usePointer = typeof window.PointerEvent !== "undefined";

  if (catList && !catList._delegBound) {
    catList._delegBound = true;
    function onCat(e) {
      var btn = e.target.closest("[data-cat-id]");
      if (!btn) return;
      e.preventDefault();
      selectCategory(btn.getAttribute("data-cat-id"));
    }
    if (usePointer) {
      catList.addEventListener("pointerup", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        onCat(e);
      });
    } else {
      catList.addEventListener("click", onCat);
    }
  }
  if (grid && !grid._delegBound) {
    grid._delegBound = true;
    var lastOpenChar = "";
    var lastOpenTs = 0;
    function openFromCard(e) {
      var card = e.target.closest("[data-char]");
      if (!card) return;
      var raw = card.getAttribute("data-char") || "";
      var ch = decodeURIComponent(raw);
      var now = Date.now();
      if (ch === lastOpenChar && now - lastOpenTs < 450) return;
      lastOpenChar = ch;
      lastOpenTs = now;
      openChar(ch);
    }
    if (usePointer) {
      grid.addEventListener("pointerup", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        openFromCard(e);
      });
    } else {
      grid.addEventListener("click", openFromCard);
    }
  }
  var learnedSubRow = document.getElementById("learnedSubRow");
  if (learnedSubRow && !learnedSubRow._delegBound) {
    learnedSubRow._delegBound = true;
    function onLearnedSub(e) {
      var btn = e.target.closest("[data-learned-sub]");
      if (!btn) return;
      e.preventDefault();
      state.learnedSub = btn.getAttribute("data-learned-sub") || "all";
      renderCategories();
      renderGrid();
      updateStats();
    }
    if (usePointer) {
      learnedSubRow.addEventListener("pointerup", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        onLearnedSub(e);
      });
    } else {
      learnedSubRow.addEventListener("click", onLearnedSub);
    }
  }
}

//  应用状态
// ============================================================
const state = {
  stars:           0,
  learned:         [],
  currentCategory: 'learned',
  learnedSub:      'all',
  currentChar:     null,
  streak:          1,
  writer:          null,
  writerReady:     false,
  strokeCount:     0,
  currentStroke:   -1,
  isAnimating:     false,
  /** 连播全部笔画播完，主按钮显示「重置」 */
  strokeAnimComplete: false,
  /** 连播在「两笔之间」暂停，继续时从 nextStrokeToPlay 接着播 */
  playbackPaused: false,
  /** 用户点了暂停：当前笔播完再进入 playbackPaused */
  pendingPauseAfterStroke: false,
  /** 暂停后下一笔的起始索引（0～strokeCount-1） */
  nextStrokeToPlay: null,
  /** 使用「下一笔」逐步演示（非连播） */
  manualStepMode: false,
  /** 下一笔已写完最后一笔，再点「下一笔」则清空回到初始 */
  stepAllDone: false,
};

/** 弹层刚打开时，移动端仍会派发一次「幽灵 click」（原触摸点落在全屏遮罩上），会误触关闭；短时间内忽略遮罩关闭 */
let modalOpenedAtMs = 0;

/** 笔顺加载与弹层打开顺序：递增后可使进行中的 onLoad 回调失效 */
let charLoadSeq = 0;

/** 逐笔 animateStroke 链：暂停/关闭时递增，丢弃过期 onComplete */
let strokeAnimSeq = 0;

function canUseNextStrokeButton() {
  if (!state.writerReady || !state.writer) return false;
  if (state.strokeAnimComplete) return false;
  if (state.playbackPaused && !state.manualStepMode) return false;
  if (state.pendingPauseAfterStroke && !state.manualStepMode) return false;
  if (state.isAnimating) return false;
  if (state.manualStepMode) return true;
  return state.currentStroke === -1;
}

function updateNextBtnEnabled() {
  var btn = document.getElementById('nextBtn');
  if (!btn) return;
  var ok = canUseNextStrokeButton();
  btn.disabled = !ok;
  btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
}

/** 弹层展开后的自动播报延迟（ms）；仅在笔顺加载成功并已 reveal 弹层后启动 */
const AUTO_SPEAK_DELAY_MS = 3000;
let autoSpeakTimerId = null;

function clearAutoSpeakTimer() {
  if (autoSpeakTimerId != null) {
    clearTimeout(autoSpeakTimerId);
    autoSpeakTimerId = null;
  }
}

/**
 * 学习弹层已展示后再延迟播报，避免「有声无窗」；关闭/换字时由 clearAutoSpeakTimer 取消。
 */
function scheduleAutoSpeakAfterModal(char, loadSeq) {
  clearAutoSpeakTimer();
  const meta = HANZI_META[char];
  autoSpeakTimerId = window.setTimeout(function () {
    autoSpeakTimerId = null;
    if (loadSeq !== charLoadSeq) return;
    if (typeof Voice === 'undefined' || !Voice.isSupported()) return;
    if (meta && meta.pinyin && String(meta.pinyin).trim()) {
      Voice.speakPinyin(meta.pinyin, { onIssue: handleVoiceIssue });
    } else {
      Voice.speakChar(char, { onIssue: handleVoiceIssue });
    }
  }, AUTO_SPEAK_DELAY_MS);
}


// ============================================================
//  初始化
// ============================================================
async function init() {
  await loadLearnData();
  syncStateFromProgressStore();
  bindLearnDelegatedEvents();
  renderCategories();
  renderGrid();
  updateStats();
  updateStarDisplay();

  const bar = document.getElementById('strokeAssetBar');
  const fill = document.getElementById('strokeAssetFill');
  const pct = document.getElementById('strokeAssetPct');
  document.body.classList.add('stroke-assets-loading');
  if (bar) {
    bar.hidden = false;
    bar.setAttribute('aria-busy', 'true');
  }
  if (fill) fill.style.width = '0%';
  if (pct) pct.textContent = '0%';

  const base = typeof getAppBaseUrl === 'function' ? getAppBaseUrl() : undefined;
  var warmResult = { ok: false };
  if (typeof HanziAdapter !== 'undefined' && typeof HanziAdapter.warmStrokePacksWithProgress === 'function') {
    warmResult = await HanziAdapter.warmStrokePacksWithProgress(base, function (ratio) {
      var p = Math.min(100, Math.max(0, Math.round(ratio * 100)));
      if (fill) fill.style.width = p + '%';
      if (pct) pct.textContent = p + '%';
    });
  } else {
    if (fill) fill.style.width = '100%';
    if (pct) pct.textContent = '100%';
  }

  window.__strokePackWarmed = warmResult.ok === true;
  document.body.classList.remove('stroke-assets-loading');
  if (bar) {
    bar.hidden = true;
    bar.setAttribute('aria-busy', 'false');
  }
}

function getAllChars() {
  if (state.currentCategory === 'learned') {
    const learnedList = state.learned.filter(function (c) { return HANZI_META[c]; });
    if (state.learnedSub === 'all') return learnedList;
    const sub = CATEGORIES.find(function (c) { return c.id === state.learnedSub; });
    if (!sub || !sub.chars || sub.chars.length === 0) return learnedList;
    var set = {};
    for (var i = 0; i < sub.chars.length; i++) set[sub.chars[i]] = true;
    return learnedList.filter(function (c) { return set[c]; });
  }
  const cat = CATEGORIES.find(function (c) { return c.id === state.currentCategory; });
  if (!cat || !cat.chars) return [];
  return cat.chars.filter(function (c) { return HANZI_META[c]; });
}

// ============================================================
//  渲染分类
// ============================================================
function renderCategories() {
  document.getElementById('categoryList').innerHTML = CATEGORIES.map(function (cat) {
    var count = cat.id === 'learned'
      ? state.learned.filter(function (c) { return HANZI_META[c]; }).length
      : (cat.chars ? cat.chars.filter(function (c) { return HANZI_META[c]; }).length : 0);
    return (
      '<button type="button" class="cat-btn ' + (cat.id === state.currentCategory ? 'active' : '') + '" ' +
      'data-cat-id="' + cat.id + '">' +
      cat.emoji + ' ' + cat.name +
      '<span style="font-size:11px;opacity:0.75;margin-left:3px;">' + count + '</span>' +
      '</button>'
    );
  }).join('');

  var subRow = document.getElementById('learnedSubRow');
  if (!subRow) return;
  if (state.currentCategory === 'learned') {
    subRow.style.display = 'flex';
    var subs = CATEGORIES.filter(function (c) { return c.id !== 'learned'; });
    var parts = [
      '<button type="button" class="cat-btn cat-sub ' + (state.learnedSub === 'all' ? 'active' : '') + '" data-learned-sub="all">' +
      '📌 全部已学</button>'
    ];
    for (var j = 0; j < subs.length; j++) {
      var sc = subs[j];
      var n = 0;
      if (sc.chars && sc.chars.length) {
        for (var k = 0; k < sc.chars.length; k++) {
          var ch = sc.chars[k];
          if (HANZI_META[ch] && state.learned.indexOf(ch) !== -1) n++;
        }
      }
      parts.push(
        '<button type="button" class="cat-btn cat-sub ' + (state.learnedSub === sc.id ? 'active' : '') + '" data-learned-sub="' +
        sc.id + '">' + sc.emoji + ' ' + sc.name +
        '<span style="font-size:11px;opacity:0.75;margin-left:3px;">' + n + '</span></button>'
      );
    }
    subRow.innerHTML = parts.join('');
  } else {
    subRow.style.display = 'none';
    subRow.innerHTML = '';
  }
}

function selectCategory(id) {
  state.currentCategory = id;
  renderCategories();
  renderGrid();
  updateStats();
  const msgs = ['来学这一组吧！✨', '这一组很有趣哦！🌟', '加油，你最棒！💪', '每天学一点越来越厉害！🎉'];
  setMascotMsg(msgs[Math.floor(Math.random() * msgs.length)]);
}

// ============================================================
//  渲染汉字网格
// ============================================================
const CARD_COLORS = ['color-1','color-2','color-3','color-4','color-5','color-6'];

function renderGrid() {
  const chars = getAllChars();
  document.getElementById('totalCount').textContent = chars.length;
  const el = document.getElementById('hanziGrid');
  if (chars.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🤔</div><p>这个分类还没有汉字哦</p></div>`;
    return;
  }
  el.innerHTML = chars.map((char, i) => {
    const data = HANZI_META[char];
    const isLearned = state.learned.includes(char);
    const safe = encodeURIComponent(char);
    return `
      <div class="hanzi-card ${CARD_COLORS[i % 6]} ${isLearned ? 'learned' : ''}"
           data-char="${safe}">
        <div class="card-char">${char}</div>
        <div class="card-pinyin">${data.pinyin}</div>
        ${isLearned ? '<div class="card-badge">✅</div>' : ''}
      </div>`;
  }).join('');
}

// ============================================================
//  统计：今日目标（随年龄）+ 当前分类进度
// ============================================================
function ageFromBirthDateLearn(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const parts = ymd.split('-').map(Number);
  const birth = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - parts[0];
  const md = today.getMonth() * 100 + today.getDate();
  const bmd = birth.getMonth() * 100 + birth.getDate();
  if (md < bmd) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * 年龄建议下限：0～4 岁 5 个/天，5 岁 10 个/天，6 岁及以上 20 个/天；未填出生日期为 10。
 * 供「我的」每日目标校验与展示。
 */
function getAgeBasedDailyMin() {
  let age = null;
  try {
    const raw = localStorage.getItem('hanzi_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u && u.birthDate) age = ageFromBirthDateLearn(u.birthDate);
    }
  } catch (_) {}
  if (age == null) return 10;
  if (age < 5) return 5;
  if (age === 5) return 10;
  return 20;
}

/**
 * 实际每日目标：若在「我的」中设置了 dailyLearnGoal 且在 [年龄下限, 50] 内则用之，否则用年龄建议。
 */
function getDailyLearnTarget() {
  const minByAge = getAgeBasedDailyMin();
  try {
    const raw = localStorage.getItem('hanzi_user');
    if (!raw) return minByAge;
    const u = JSON.parse(raw);
    if (u.dailyLearnGoal != null && u.dailyLearnGoal !== '') {
      const n = parseInt(String(u.dailyLearnGoal), 10);
      if (!isNaN(n) && n >= minByAge && n <= 50) return n;
    }
  } catch (_) {}
  return minByAge;
}

window.getAgeBasedDailyMin = getAgeBasedDailyMin;

function updateTodayProgressUI() {
  const target = getDailyLearnTarget();
  const done = ProgressStore.getTodayNewLearnedCount();
  const reached = target > 0 && done >= target;
  const pct = target > 0 ? (reached ? 100 : Math.min(100, Math.round((done / target) * 100))) : 0;
  const fill = document.getElementById('progressFill');
  const txt = document.getElementById('progressText');
  if (fill) {
    fill.style.width = pct + '%';
    fill.classList.toggle('progress-fill--complete', reached);
  }
  if (txt) txt.textContent = done + '/' + target;
}

function updateCategoryProgressUI() {
  const wrap = document.getElementById('categoryProgressWrap');
  const titleEl = document.getElementById('categoryProgressTitle');
  const fracEl = document.getElementById('categoryProgressFraction');
  const fill = document.getElementById('categoryProgressFill');
  if (!wrap || !titleEl || !fracEl || !fill) return;

  if (state.currentCategory === 'learned') {
    wrap.hidden = true;
    return;
  }

  const cat = CATEGORIES.find(function (c) {
    return c.id === state.currentCategory;
  });
  if (!cat) {
    wrap.hidden = true;
    return;
  }

  const list = (cat.chars || []).filter(function (ch) {
    return HANZI_META[ch];
  });
  const total = list.length;
  let learned = 0;
  for (let i = 0; i < list.length; i++) {
    if (state.learned.indexOf(list[i]) !== -1) learned++;
  }
  const pct = total > 0 ? Math.round((learned / total) * 100) : 0;

  wrap.hidden = false;
  titleEl.textContent = (cat.emoji ? cat.emoji + ' ' : '') + (cat.name || '当前分类');
  fracEl.textContent = learned + '/' + total;
  fill.style.width = pct + '%';
}

function updateStats() {
  const chars = getAllChars();
  document.getElementById('learnedCount').textContent = state.learned.length;
  document.getElementById('totalCount').textContent = chars.length;
  document.getElementById('streakCount').textContent = state.streak;
  updateTodayProgressUI();
  updateCategoryProgressUI();
}
function updateStarDisplay() {
  document.getElementById('starCount').textContent = state.stars;
}

// ============================================================
//  打开汉字弹层 & 创建 Hanzi Writer 实例
// ============================================================
function openChar(char) {
  const meta = HANZI_META[char];
  if (!meta) return;

  if (document.body.classList.contains('stroke-assets-loading')) {
    if (typeof showToast === 'function') {
      showToast('⏳ 笔顺动画资源加载中，请稍候再点字…');
    }
    return;
  }

  const loadSeq = ++charLoadSeq;
  clearAutoSpeakTimer();

  var act = ProgressStore.recordLearningActivity();
  state.streak = act.streak;
  updateStats();

  state.currentChar  = char;
  state.writerReady  = false;
  state.strokeCount  = 0;
  state.currentStroke = -1;
  state.isAnimating  = false;

  // 基础信息（弹层在笔顺加载成功后再展示）
  document.getElementById('modalCharBig').textContent   = char;
  document.getElementById('modalPinyin').textContent    = meta.pinyin;
  document.getElementById('modalStrokeCount').textContent = '? 画';
  document.getElementById('strokeStep').textContent     = '';
  document.getElementById('loadingHint').textContent    = '⏳ 正在加载笔顺数据…';
  document.getElementById('loadingHint').style.display  = 'block';
  document.getElementById('strokeIndicators').innerHTML = '';

  // 记住按钮
  const remBtn = document.getElementById('rememberBtn');
  if (state.learned.includes(char)) {
    remBtn.classList.add('learned-state');
    remBtn.innerHTML = '<span>✅</span> 已学会！';
  } else {
    remBtn.classList.remove('learned-state');
    remBtn.innerHTML = '<span>🌟</span> 我记住了！';
  }

  setMascotMsg(`正在学"${char}"，${meta.meaning}，${meta.pinyin}，笔顺动画马上开始！`);

  // 先全屏加载层，不打开学习弹层（笔顺包已首屏预热且该字在分片内时跳过，直接走笔顺创建 → 弹层）
  const loadOverlay = document.getElementById('charLoadOverlay');
  const useStrokeFastPath =
    window.__strokePackWarmed === true &&
    window.__strokeShardMap &&
    Object.prototype.hasOwnProperty.call(window.__strokeShardMap, char);

  loadOverlay.classList.remove('char-load-overlay--error');
  loadOverlay.setAttribute('aria-busy', 'true');
  document.getElementById('charLoadChar').textContent = char;
  document.getElementById('charLoadMsg').textContent = '正在加载笔顺数据…';
  const charLoadSpinner = document.getElementById('charLoadSpinner');
  if (charLoadSpinner) charLoadSpinner.style.display = '';
  if (useStrokeFastPath) {
    loadOverlay.classList.remove('active');
  } else {
    loadOverlay.classList.add('active');
  }

  // 自动朗读改到笔顺加载成功、学习弹层展开后延迟 3s（见 scheduleAutoSpeakAfterModal），
  // 不在此处触发，避免出现「已发声但弹层未打开」的感知。

  // 销毁旧 writer（如有），清空容器
  const container = document.getElementById('hanziWriterContainer');
  container.innerHTML = '';
  state.writer = null;

  // 延迟一帧再创建（等容器尺寸稳定）
  requestAnimationFrame(() => {
    createWriter(char, loadSeq);
  });
}

/**
 * 笔顺就绪后：先让学习弹层入场，再在下一帧关掉加载层（避免先关加载再开弹层时主界面闪一下）
 */
function revealCharModalAfterLoad() {
  modalOpenedAtMs = Date.now();
  document.getElementById('modalOverlay').classList.add('active');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      const o = document.getElementById('charLoadOverlay');
      o.classList.remove('active');
      o.classList.remove('char-load-overlay--error');
      o.setAttribute('aria-busy', 'false');
    });
  });
}

/** 加载中/失败时点击空白关闭 */
function closeCharLoading() {
  charLoadSeq++;
  strokeAnimSeq++;
  clearAutoSpeakTimer();
  if (typeof window.speechSynthesis !== 'undefined') {
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }
  const overlay = document.getElementById('charLoadOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.classList.remove('char-load-overlay--error');
    overlay.setAttribute('aria-busy', 'false');
  }
  const spin = document.getElementById('charLoadSpinner');
  if (spin) spin.style.display = '';
  const msg = document.getElementById('charLoadMsg');
  if (msg) msg.textContent = '正在加载笔顺数据…';
  if (state.writer) {
    try { state.writer.cancelAnimation(); } catch (e) {}
  }
  state.writer = null;
  state.writerReady = false;
  state.isAnimating = false;
  state.currentChar = null;
  state.currentStroke = -1;
  state.strokeCount = 0;
  const container = document.getElementById('hanziWriterContainer');
  if (container) container.innerHTML = '';
  const dots = document.getElementById('strokeIndicators');
  if (dots) dots.innerHTML = '';
  const step = document.getElementById('strokeStep');
  if (step) step.textContent = '';
  const playBtn = document.getElementById('playBtn');
  if (playBtn) playBtn.textContent = '▶ 播放';
  state.strokeAnimComplete = false;
  state.playbackPaused = false;
  state.pendingPauseAfterStroke = false;
  state.nextStrokeToPlay = null;
  state.manualStepMode = false;
  state.stepAllDone = false;
  updateNextBtnEnabled();
}

function handleCharLoadOverlayClick(e) {
  if (e.target === document.getElementById('charLoadOverlay')) {
    closeCharLoading();
  }
}

// ============================================================
//  创建 Hanzi Writer 实例
// ============================================================
function createWriter(char, loadSeq) {
  const container = document.getElementById('hanziWriterContainer');
  container.style.width  = '220px';
  container.style.height = '220px';

  state.writer = HanziAdapter.create('hanziWriterContainer', char, {
    onLoadCharDataSuccess: function(data) {
      if (loadSeq !== charLoadSeq) return;
      state.writerReady = true;
      state.strokeCount = data.strokes.length;
      document.getElementById('modalStrokeCount').textContent = data.strokes.length + ' 画';
      document.getElementById('loadingHint').style.display = 'none';
      renderStrokeDots(data.strokes.length);

      revealCharModalAfterLoad();
      scheduleAutoSpeakAfterModal(char, loadSeq);
      setTimeout(function () {
        beginStrokePlaybackFromStart();
        updateNextBtnEnabled();
      }, 300);
    },
    onLoadCharDataError: function() {
      if (loadSeq !== charLoadSeq) return;
      document.getElementById('loadingHint').textContent = '笔顺数据加载失败，请检查网络';
      const overlay = document.getElementById('charLoadOverlay');
      overlay.classList.add('active');
      overlay.classList.add('char-load-overlay--error');
      document.getElementById('charLoadMsg').textContent = '笔顺数据加载失败，请检查网络后重试';
      overlay.setAttribute('aria-busy', 'false');
      const spin = document.getElementById('charLoadSpinner');
      if (spin) spin.style.display = 'none';
    }
  });
}

// ============================================================
//  笔画序号点 & 名称同步
// ============================================================
function renderStrokeDots(count) {
  document.getElementById('strokeIndicators').innerHTML =
    Array.from({ length: count }, (_, i) =>
      `<div class="stroke-dot" id="dot${i}">${i+1}</div>`
    ).join('');
}

function updateStrokeNameChips(count) { /* 已移除笔画名称展示 */ }

function setDotState(idx, state_name) {
  const dot = document.getElementById('dot' + idx);
  if (!dot) return;
  dot.classList.remove('current', 'done');
  if (state_name) dot.classList.add(state_name);
}

function setChipActive(idx) { /* 已移除 */ }

function syncIndicatorToStroke(strokeIdx) {
  for (let i = 0; i < strokeIdx; i++) setDotState(i, 'done');
  setDotState(strokeIdx, 'current');
  document.getElementById('strokeStep').textContent =
    `第 ${strokeIdx + 1}/${state.strokeCount} 笔`;
}

// ============================================================
//  控制按钮
// ============================================================

/** 从头开始整字连播（与首次点「播放」相同） */
function beginStrokePlaybackFromStart() {
  strokeAnimSeq++;
  state.currentStroke = -1;
  state.isAnimating = true;
  state.strokeAnimComplete = false;
  state.playbackPaused = false;
  state.pendingPauseAfterStroke = false;
  state.nextStrokeToPlay = null;
  state.manualStepMode = false;
  state.stepAllDone = false;
  var playBtn = document.getElementById('playBtn');
  if (playBtn) playBtn.textContent = '⏸ 暂停';
  document.querySelectorAll('.stroke-dot').forEach(function (d) {
    d.classList.remove('current', 'done');
  });
  document.getElementById('strokeStep').textContent = '';
  runStrokeAnimationChain(0);
  updateNextBtnEnabled();
}

function runStrokeAnimationChain(strokeIndex) {
  var mySeq = strokeAnimSeq;
  if (!state.isAnimating || !state.writer || !state.writerReady) return;

  if (strokeIndex >= state.strokeCount) {
    if (mySeq !== strokeAnimSeq) return;
    state.isAnimating = false;
    state.playbackPaused = false;
    state.currentStroke = state.strokeCount - 1;
    state.strokeAnimComplete = true;
    state.pendingPauseAfterStroke = false;
    state.nextStrokeToPlay = null;
    document.getElementById('playBtn').textContent = '重置';
    document.getElementById('strokeStep').textContent = '完成！🎉';
    for (var i = 0; i < state.strokeCount; i++) setDotState(i, 'done');
    showToast('🎊 写完啦，真棒！');
    updateNextBtnEnabled();
    return;
  }

  state.currentStroke = strokeIndex;
  syncIndicatorToStroke(strokeIndex);

  try {
    state.writer.animateStroke(strokeIndex, {
      onComplete: function () {
        if (mySeq !== strokeAnimSeq) return;
        if (state.playbackPaused) return;
        if (!state.isAnimating) return;
        setDotState(strokeIndex, 'done');

        if (state.pendingPauseAfterStroke) {
          state.pendingPauseAfterStroke = false;
          if (strokeIndex >= state.strokeCount - 1) {
            runStrokeAnimationChain(strokeIndex + 1);
            return;
          }
          state.isAnimating = false;
          state.playbackPaused = true;
          state.nextStrokeToPlay = strokeIndex + 1;
          document.getElementById('playBtn').textContent = '▶ 播放';
          updateNextBtnEnabled();
          return;
        }
        runStrokeAnimationChain(strokeIndex + 1);
      }
    });
    updateNextBtnEnabled();
  } catch (e) {
    console.warn('播放失败:', e);
    state.isAnimating = false;
    state.playbackPaused = false;
    state.pendingPauseAfterStroke = false;
    state.nextStrokeToPlay = null;
    document.getElementById('playBtn').textContent = '▶ 播放';
    updateNextBtnEnabled();
  }
}

function doPlay() {
  if (!state.writer) {
    showToast('⏳ 数据加载中，请稍候…');
    return;
  }
  if (state.strokeAnimComplete) {
    doReset();
    return;
  }
  if (state.manualStepMode) {
    doReset();
    setTimeout(function () {
      if (!state.writer || !state.writerReady) return;
      beginStrokePlaybackFromStart();
    }, 300);
    return;
  }
  if (state.playbackPaused) {
    if (state.nextStrokeToPlay == null || state.nextStrokeToPlay >= state.strokeCount) {
      state.playbackPaused = false;
      document.getElementById('playBtn').textContent = '▶ 播放';
      updateNextBtnEnabled();
      showToast('请从「播放」重新开始');
      return;
    }
    state.isAnimating = true;
    state.playbackPaused = false;
    state.pendingPauseAfterStroke = false;
    var n = state.nextStrokeToPlay;
    state.nextStrokeToPlay = null;
    document.getElementById('playBtn').textContent = '⏸ 暂停';
    runStrokeAnimationChain(n);
    updateNextBtnEnabled();
    return;
  }
  if (state.isAnimating) {
    state.pendingPauseAfterStroke = true;
    document.getElementById('playBtn').textContent = '⏸ 暂停';
    updateNextBtnEnabled();
    return;
  }

  doReset();
  setTimeout(function () {
    if (!state.writer || !state.writerReady) return;
    beginStrokePlaybackFromStart();
  }, 300);
}

function doNext() {
  if (!state.writerReady || !state.writer) {
    showToast('⏳ 数据加载中，请稍候…');
    return;
  }
  if (!canUseNextStrokeButton()) {
    showToast('连播或笔画动画进行中时无法使用「下一笔」，请先重置或等待结束');
    return;
  }

  if (state.manualStepMode && state.stepAllDone) {
    doReset();
    return;
  }

  if (!state.manualStepMode && state.currentStroke === -1) {
    strokeAnimSeq++;
    state.manualStepMode = true;
    state.stepAllDone = false;
    state.isAnimating = true;
    state.currentStroke = 0;
    syncIndicatorToStroke(0);
    var mySeq0 = strokeAnimSeq;
    try {
      state.writer.animateStroke(0, {
        onComplete: function () {
          if (mySeq0 !== strokeAnimSeq) return;
          state.isAnimating = false;
          setDotState(0, 'done');
          if (state.strokeCount <= 1) {
            state.stepAllDone = true;
            document.getElementById('strokeStep').textContent = '完成！🎉';
            for (var j = 0; j < state.strokeCount; j++) setDotState(j, 'done');
          }
          updateNextBtnEnabled();
        }
      });
    } catch (e) {
      console.warn('下一笔失败:', e);
      state.isAnimating = false;
      state.manualStepMode = false;
      updateNextBtnEnabled();
    }
    updateNextBtnEnabled();
    return;
  }

  if (state.manualStepMode && !state.stepAllDone) {
    var nextIdx = state.currentStroke + 1;
    if (nextIdx >= state.strokeCount) return;
    strokeAnimSeq++;
    state.isAnimating = true;
    state.currentStroke = nextIdx;
    syncIndicatorToStroke(nextIdx);
    var mySeq1 = strokeAnimSeq;
    try {
      state.writer.animateStroke(nextIdx, {
        onComplete: function () {
          if (mySeq1 !== strokeAnimSeq) return;
          state.isAnimating = false;
          setDotState(nextIdx, 'done');
          if (nextIdx >= state.strokeCount - 1) {
            state.stepAllDone = true;
            document.getElementById('strokeStep').textContent = '完成！🎉';
            for (var k = 0; k < state.strokeCount; k++) setDotState(k, 'done');
          }
          updateNextBtnEnabled();
        }
      });
    } catch (e2) {
      console.warn('下一笔失败:', e2);
      state.isAnimating = false;
      updateNextBtnEnabled();
    }
    updateNextBtnEnabled();
  }
}

function doReset() {
  strokeAnimSeq++;
  state.strokeAnimComplete = false;
  state.playbackPaused = false;
  state.pendingPauseAfterStroke = false;
  state.nextStrokeToPlay = null;
  state.manualStepMode = false;
  state.stepAllDone = false;
  if (!state.writer) {
    state.isAnimating   = false;
    state.currentStroke = -1;
    document.getElementById('playBtn').textContent      = '▶ 播放';
    document.getElementById('strokeStep').textContent   = '';
    document.querySelectorAll('.stroke-dot').forEach(function (d) { d.classList.remove('current', 'done'); });
    updateNextBtnEnabled();
    return;
  }
  try { state.writer.cancelAnimation(); } catch (e) {}
  try { state.writer.pauseAnimation(); } catch (e2) {}

  state.isAnimating   = false;
  state.currentStroke = -1;
  document.getElementById('playBtn').textContent      = '▶ 播放';
  document.getElementById('strokeStep').textContent   = '';
  document.querySelectorAll('.stroke-dot').forEach(d => d.classList.remove('current','done'));
  try {
    state.writer.hideCharacter({ duration: 0 });
    setTimeout(() => {
      state.writer.showOutline({ duration: 200 });
    }, 50);
  } catch(e) {
    console.warn('重置失败:', e);
  }
  updateNextBtnEnabled();
}

// ============================================================
//  记住了 / 标记学会
// ============================================================
function markLearned() {
  const char = state.currentChar;
  if (!char) return;
  if (!state.learned.includes(char)) {
    state.learned.push(char);
    state.stars += 3;
    ProgressStore.saveStarsAndLearned(state.stars, state.learned);
    ProgressStore.incrementTodayNewLearned();
    updateStarDisplay();
    spawnStars();
    showToast('🌟 太棒了！获得3颗星！');
    const remBtn = document.getElementById('rememberBtn');
    remBtn.classList.add('learned-state');
    remBtn.innerHTML = '<span>✅</span> 已学会！';
    updateStats();
    renderGrid();
    setMascotMsg(`哇！你学会了"${char}"！继续加油吧！🎉`);
  } else {
    showToast('✅ 这个字你已经学会啦！');
  }
}

// ============================================================
//  星星爆炸特效
// ============================================================
function spawnStars() {
  const burst = document.getElementById('starBurst');
  const emojis = ['⭐','🌟','✨','💫','🎉','🎊'];
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  for (let i = 0; i < 14; i++) {
    const el = document.createElement('div');
    el.className = 'star-particle';
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const angle = (i / 14) * 360 + Math.random() * 30;
    const dist  = 80 + Math.random() * 160;
    el.style.left = cx + 'px';
    el.style.top  = cy + 'px';
    el.style.setProperty('--tx', Math.cos(angle * Math.PI / 180) * dist + 'px');
    el.style.setProperty('--ty', (Math.sin(angle * Math.PI / 180) * dist - 80) + 'px');
    el.style.setProperty('--tr', (Math.random() * 360 - 180) + 'deg');
    el.style.animationDelay = (Math.random() * 0.3) + 's';
    burst.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
}

// ============================================================
//  关闭弹层
// ============================================================
function closeModal() {
  strokeAnimSeq++;
  clearAutoSpeakTimer();
  if (state.writer) {
    try { state.writer.cancelAnimation(); } catch (e) {}
  }
  state.isAnimating = false;
  state.playbackPaused = false;
  state.pendingPauseAfterStroke = false;
  state.nextStrokeToPlay = null;
  state.manualStepMode = false;
  state.stepAllDone = false;
  // 关闭时停止语音
  if (typeof Voice !== 'undefined' && Voice.isSupported()) {
    window.speechSynthesis && window.speechSynthesis.cancel();
  }
  document.getElementById('modalOverlay').classList.remove('active');
  const loadOv = document.getElementById('charLoadOverlay');
  if (loadOv && loadOv.classList.contains('active')) {
    loadOv.classList.remove('active');
    loadOv.classList.remove('char-load-overlay--error');
    loadOv.setAttribute('aria-busy', 'false');
  }
  updateNextBtnEnabled();
}
function handleOverlayClick(e) {
  if (e.target !== document.getElementById('modalOverlay')) return;
  // grid 用 pointerup 打开弹层后，浏览器仍会合成 click 落在遮罩上，勿当作「点击空白关闭」
  if (Date.now() - modalOpenedAtMs < 500) return;
  closeModal();
}

// ============================================================
//  语音朗读入口（供 HTML onclick 调用）
// ============================================================
// 按钮发光动画时长（ms），与 CSS .voice-btn.speaking 动画时长保持一致
const VOICE_BTN_ANIM_MS = 1200;

/** 无中文音色提示仅在本会话提示一次，避免每次点字刷屏 */
const voiceIssueState = { noZhWarned: false };

function handleVoiceIssue(code) {
  if (typeof showToast !== 'function') return;
  if (code === 'no_zh_voice') {
    if (voiceIssueState.noZhWarned) return;
    voiceIssueState.noZhWarned = true;
    showToast(
      '未检测到中文朗读语音，请在系统中检查语言与辅助功能设置，或使用 Safari / Chrome 等系统浏览器打开本站'
    );
    return;
  }
  if (code === 'speak_error') {
    showToast('朗读失败，请重试。若在微信等应用内打开，请改用系统浏览器或检查手机是否静音');
  }
}

function voiceSpeakCurrent() {
  if (typeof Voice === 'undefined' || !Voice.isSupported()) {
    showToast('😢 当前浏览器不支持语音朗读');
    return;
  }
  const char = state.currentChar;
  if (!char) return;

  // 播放动效
  const btn = document.getElementById('voiceBtn');
  if (btn) {
    btn.classList.add('speaking');
    setTimeout(() => btn.classList.remove('speaking'), VOICE_BTN_ANIM_MS);
  }
  const meta = HANZI_META[char];
  if (meta && meta.pinyin && String(meta.pinyin).trim()) {
    Voice.speakPinyin(meta.pinyin, { onIssue: handleVoiceIssue });
  } else {
    Voice.speakChar(char, { onIssue: handleVoiceIssue });
  }
}
