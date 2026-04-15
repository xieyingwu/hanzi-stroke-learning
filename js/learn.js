// 学习页逻辑 — 字表数据由 data/*.json 提供（需 HTTP 访问，见 README）
let HANZI_META = {};
let CATEGORIES = [];

async function loadLearnData() {
  const base = new URL(".", window.location.href);
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
}

//  应用状态
// ============================================================
const state = {
  stars:           0,
  learned:         [],
  currentCategory: 'all',
  currentChar:     null,
  streak:          1,
  writer:          null,
  writerReady:     false,
  strokeCount:     0,
  currentStroke:   -1,
  isAnimating:     false,
};


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
}

function getAllChars() {
  if (state.currentCategory === 'all') return Object.keys(HANZI_META);
  const cat = CATEGORIES.find(c => c.id === state.currentCategory);
  if (!cat || !cat.chars) return Object.keys(HANZI_META);
  return cat.chars.filter(c => HANZI_META[c]);
}

// ============================================================
//  渲染分类
// ============================================================
function renderCategories() {
  document.getElementById('categoryList').innerHTML = CATEGORIES.map(cat => {
    const count = cat.id === 'all' ? Object.keys(HANZI_META).length : (cat.chars ? cat.chars.filter(c => HANZI_META[c]).length : 0);
    return `
    <button type="button" class="cat-btn ${cat.id === state.currentCategory ? 'active' : ''}"
      data-cat-id="${cat.id}">
      ${cat.emoji} ${cat.name}<span style="font-size:11px;opacity:0.75;margin-left:3px;">${count}</span>
    </button>`;
  }).join('');
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
//  统计
// ============================================================
function updateStats() {
  const chars = getAllChars();
  const learnedInCat = chars.filter(c => state.learned.includes(c)).length;
  document.getElementById('learnedCount').textContent = state.learned.length;
  document.getElementById('totalCount').textContent  = chars.length;
  document.getElementById('streakCount').textContent = state.streak;
  const pct = chars.length > 0 ? Math.round(learnedInCat / chars.length * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = pct + '%';
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

  var act = ProgressStore.recordLearningActivity();
  state.streak = act.streak;
  updateStats();

  state.currentChar  = char;
  state.writerReady  = false;
  state.strokeCount  = 0;
  state.currentStroke = -1;
  state.isAnimating  = false;

  // 基础信息
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

  // 先展示弹层
  document.getElementById('modalOverlay').classList.add('active');

  // 自动朗读：须在用户点击的同步调用栈内触发 speechSynthesis，不能用 setTimeout，
  // 否则 Safari / iOS 与部分 Chrome 会按「非用户手势」静默拦截，导致无声音。
  if (typeof Voice !== 'undefined' && Voice.isSupported()) {
    Voice.speakChar(char);
  }

  // 销毁旧 writer（如有），清空容器
  const container = document.getElementById('hanziWriterContainer');
  container.innerHTML = '';
  state.writer = null;

  // 延迟一帧再创建（等容器尺寸稳定）
  requestAnimationFrame(() => {
    createWriter(char);
  });
}

// ============================================================
//  创建 Hanzi Writer 实例
// ============================================================
function createWriter(char) {
  const container = document.getElementById('hanziWriterContainer');
  container.style.width  = '220px';
  container.style.height = '220px';

  state.writer = HanziAdapter.create('hanziWriterContainer', char, {
    onLoadCharDataSuccess: function(data) {
      state.writerReady = true;
      state.strokeCount = data.strokes.length;
      document.getElementById('modalStrokeCount').textContent = data.strokes.length + ' 画';
      document.getElementById('loadingHint').style.display = 'none';
      renderStrokeDots(data.strokes.length);

      setTimeout(function () { doPlay(); }, 300);
    },
    onLoadCharDataError: function() {
      document.getElementById('loadingHint').textContent = '笔顺数据加载失败，请检查网络';
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

function doPlay() {
  // 如果正在加载数据，提示等待
  if (!state.writer) {
    showToast('⏳ 数据加载中，请稍候…');
    return;
  }
  // 暂停逻辑
  if (state.isAnimating) {
    try { state.writer.pauseAnimation(); } catch(e) {}
    try { state.writer.cancelAnimation(); } catch(e) {}
    state.isAnimating = false;
    document.getElementById('playBtn').textContent = '▶ 继续';
    return;
  }

  // 从头播放 / 继续
  state.currentStroke = -1;
  state.isAnimating   = true;
  document.getElementById('playBtn').textContent = '⏸ 暂停';
  document.querySelectorAll('.stroke-dot').forEach(d => d.classList.remove('current','done'));
  document.getElementById('strokeStep').textContent = '';

  try {
    state.writer.animateCharacter({
    onComplete: function() {
      state.isAnimating   = false;
      state.currentStroke = state.strokeCount - 1;
      document.getElementById('playBtn').textContent = '▶ 重播';
      document.getElementById('strokeStep').textContent = '完成！🎉';
      for (let i = 0; i < state.strokeCount; i++) setDotState(i, 'done');
      showToast('🎊 写完啦，真棒！');
    },
    onStrokeComplete: function(strokeNum, numStrokes) {
      const idx = strokeNum - 1;
      state.currentStroke = idx;
      syncIndicatorToStroke(idx);
    }
    });
  } catch(e) {
    console.warn('播放失败:', e);
    state.isAnimating = false;
    document.getElementById('playBtn').textContent = '▶ 播放';
  }
}

function doNext() {
  if (!state.writerReady || !state.writer) {
    showToast('⏳ 数据加载中，请稍候…');
    return;
  }
  if (state.isAnimating) return;

  const next = state.currentStroke + 1;
  if (next >= state.strokeCount) {
    showToast('🎉 所有笔画都写完啦！');
    document.getElementById('strokeStep').textContent = '完成！🎉';
    return;
  }

  state.currentStroke = next;
  syncIndicatorToStroke(next);

  state.writer.animateStroke(next, {
    onComplete: function() {}
  });
}

function doReset() {
  if (!state.writer) {
    // 数据还没加载完，先重置状态，等加载完后会自动播放
    state.isAnimating   = false;
    state.currentStroke = -1;
    document.getElementById('playBtn').textContent      = '▶ 播放';
    document.getElementById('strokeStep').textContent   = '';
    document.querySelectorAll('.stroke-dot').forEach(d => d.classList.remove('current','done'));
    return;
  }
  try { state.writer.cancelAnimation(); } catch(e) {}
  try { state.writer.pauseAnimation(); } catch(e) {}

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
  if (state.writer) {
    try { state.writer.cancelAnimation(); } catch(e) {}
  }
  state.isAnimating = false;
  // 关闭时停止语音
  if (typeof Voice !== 'undefined' && Voice.isSupported()) {
    window.speechSynthesis && window.speechSynthesis.cancel();
  }
  document.getElementById('modalOverlay').classList.remove('active');
}
function handleOverlayClick(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

// ============================================================
//  语音朗读入口（供 HTML onclick 调用）
// ============================================================
// 按钮发光动画时长（ms），与 CSS .voice-btn.speaking 动画时长保持一致
const VOICE_BTN_ANIM_MS = 1200;

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
  Voice.speakChar(char);
}
