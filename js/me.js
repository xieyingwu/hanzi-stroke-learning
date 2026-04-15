// ============================================================
//  我的 - 登录 / 个人信息
// ============================================================
const ME_STORAGE_KEY = 'hanzi_user';
const BIO_MAX_LEN = 100;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** 笔顺播放：笔画间隔（delayBetweenStrokes，ms）+ 单笔书写倍率（strokeAnimationSpeed，越小越慢） */
const STROKE_SPEED_PRESETS = {
  fast: { delayBetweenStrokes: 500, strokeAnimationSpeed: 0.65 },
  medium: { delayBetweenStrokes: 800, strokeAnimationSpeed: 0.5 },
  slow: { delayBetweenStrokes: 1000, strokeAnimationSpeed: 0.4 },
};
const STROKE_SPEED_LABEL = {
  fast: '快速（0.5 秒）',
  medium: '中速（0.8 秒）',
  slow: '慢速（1 秒）',
};

/** 供 HanziAdapter 创建 Writer 时读取（未登录则中速） */
function getStrokeAnimWriterOptions() {
  var u = getUserData();
  var key = u && u.strokeAnimSpeed ? u.strokeAnimSpeed : 'medium';
  if (!STROKE_SPEED_PRESETS[key]) key = 'medium';
  var p = STROKE_SPEED_PRESETS[key];
  return {
    delayBetweenStrokes: p.delayBetweenStrokes,
    strokeAnimationSpeed: p.strokeAnimationSpeed,
  };
}
window.getStrokeAnimWriterOptions = getStrokeAnimWriterOptions;

function getUserData() {
  try {
    return JSON.parse(localStorage.getItem(ME_STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}
function setUserData(data) {
  localStorage.setItem(ME_STORAGE_KEY, JSON.stringify(data));
}

function ageFromBirthDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const md = today.getMonth() * 100 + today.getDate();
  const bmd = birth.getMonth() * 100 + birth.getDate();
  if (md < bmd) age -= 1;
  return age >= 0 ? age : null;
}

function formatBirthDisplay(user) {
  if (user.birthDate) {
    const age = ageFromBirthDate(user.birthDate);
    return age != null ? `${user.birthDate}（${age}岁）` : user.birthDate;
  }
  if (user.age) return `${user.age}岁（请更新为出生日期）`;
  return '未设置';
}

function refreshMePage() {
  const user = getUserData();
  if (user && user.loggedIn) {
    document.getElementById('meLogin').style.display = 'none';
    document.getElementById('meProfile').style.display = 'block';
    const avatarEl = document.getElementById('profileAvatar');
    if (user.avatarUrl) {
      avatarEl.innerHTML = '<img src="' + user.avatarUrl + '" alt="头像">';
    } else {
      avatarEl.textContent = '🐼';
    }
    document.getElementById('profileName').textContent = user.nickname || '用户';
    document.getElementById('profilePhone').textContent = maskPhone(user.phone || '');
    document.getElementById('profileJoinDate').textContent = '加入于 ' + (user.joinDate || '2026-04-14');
    document.getElementById('infoNickname').textContent = user.nickname || '未设置';
    document.getElementById('infoGender').textContent = user.gender || '未设置';
    document.getElementById('infoBirth').textContent = formatBirthDisplay(user);
    const bioRow = document.getElementById('infoRowBio');
    const bioInline = document.getElementById('infoBio');
    const bioDetail = document.getElementById('infoBioDetail');
    const bioText = (user.bio && String(user.bio).trim()) || '';
    if (bioRow && bioInline && bioDetail) {
      if (bioText) {
        bioRow.classList.remove('info-row--bio-empty');
        bioInline.textContent = '';
        bioDetail.textContent = bioText;
        bioDetail.hidden = false;
      } else {
        bioRow.classList.add('info-row--bio-empty');
        bioInline.textContent = '未设置';
        bioDetail.textContent = '';
        bioDetail.hidden = true;
      }
    }
    const infoDaily = document.getElementById('infoDailyGoal');
    if (infoDaily && typeof getDailyLearnTarget === 'function') {
      infoDaily.textContent = getDailyLearnTarget() + ' 个/天';
    }
    const infoStroke = document.getElementById('infoStrokeAnimSpeed');
    if (infoStroke) {
      var sk = user.strokeAnimSpeed && STROKE_SPEED_LABEL[user.strokeAnimSpeed] ? user.strokeAnimSpeed : 'medium';
      infoStroke.textContent = STROKE_SPEED_LABEL[sk];
    }
    const stars = ProgressStore.getStars();
    const learned = ProgressStore.getLearnedCount();
    const streakDays = ProgressStore.getStreak();
    document.getElementById('meStars').textContent = stars;
    document.getElementById('meLearned').textContent = learned;
    document.getElementById('meDays').textContent = streakDays;
  } else {
    document.getElementById('meLogin').style.display = '';
    document.getElementById('meProfile').style.display = 'none';
  }
}

function maskPhone(phone) {
  if (phone.length >= 7) return phone.substring(0, 3) + '****' + phone.substring(7);
  return phone;
}

function syncLoginSubtitle() {
  const el = document.getElementById('loginSubtitle');
  const remember = document.getElementById('loginRememberPassword');
  if (!el || !remember) return;
  if (remember.checked) {
    el.textContent =
      '本地演示用登录，数据不上传云端；勾选记住密码后仅在本地保存，用于退出时校验。学习进度与星星见首页统计。';
  } else {
    el.textContent = '本地演示用登录，数据不上传云端；未记住密码时退出需强制清除学习记录。学习进度与星星见首页统计。';
  }
}

function handleLogin() {
  const phone = document.getElementById('loginPhone').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const remember = document.getElementById('loginRememberPassword').checked;
  if (!/^1\d{10}$/.test(phone)) {
    showToast('📱 请输入正确的手机号');
    return;
  }
  if (password.length < 6) {
    showToast('🔑 密码至少6位');
    return;
  }
  const user = {
    loggedIn: true,
    phone: phone,
    rememberPassword: remember,
    password: remember ? password : '',
    nickname: '',
    gender: '',
    birthDate: '',
    bio: '',
    avatarUrl: '',
    joinDate: new Date().toISOString().split('T')[0],
    dailyLearnGoal: '',
    strokeAnimSpeed: 'medium',
  };
  setUserData(user);
  document.getElementById('loginPassword').value = '';
  showToast('🎉 登录成功！');
  refreshMePage();
}

function openLogoutFlow() {
  const user = getUserData();
  if (!user || !user.loggedIn) return;
  if (user.rememberPassword && user.password) {
    document.getElementById('logoutPasswordInput').value = '';
    document.getElementById('logoutPasswordOverlay').classList.add('active');
    setTimeout(function () {
      document.getElementById('logoutPasswordInput').focus();
    }, 200);
  } else {
    document.getElementById('logoutForceOverlay').classList.add('active');
  }
}

function closeLogoutPasswordModal() {
  document.getElementById('logoutPasswordOverlay').classList.remove('active');
}

function closeLogoutForceModal() {
  document.getElementById('logoutForceOverlay').classList.remove('active');
}

function confirmLogoutWithPassword() {
  const user = getUserData();
  const input = document.getElementById('logoutPasswordInput').value;
  if (!user || !user.password) {
    closeLogoutPasswordModal();
    return;
  }
  if (input !== user.password) {
    showToast('密码不正确');
    return;
  }
  performLogoutClear();
  closeLogoutPasswordModal();
}

function confirmForceLogout() {
  performLogoutClear();
  closeLogoutForceModal();
}

function performLogoutClear() {
  localStorage.removeItem(ME_STORAGE_KEY);
  ProgressStore.clearAll();
  showToast('已退出登录');
  refreshMePage();
  if (typeof syncStateFromProgressStore === 'function') syncStateFromProgressStore();
  if (typeof renderCategories === 'function') renderCategories();
  if (typeof renderGrid === 'function') renderGrid();
  if (typeof updateStats === 'function') updateStats();
  if (typeof updateStarDisplay === 'function') updateStarDisplay();
}

function handleLogout() {
  openLogoutFlow();
}

// --- 头像 ---
function initAvatarUpload() {
  const btn = document.getElementById('profileAvatar');
  const fileInput = document.getElementById('avatarFileInput');
  if (!btn || !fileInput) return;
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    fileInput.click();
  });
  fileInput.addEventListener('change', function () {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file || !file.type.startsWith('image/')) {
      if (file) showToast('请选择图片文件');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      showToast('图片请小于 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string' || dataUrl.length > 2 * 1024 * 1024) {
        showToast('图片过大，请换一张');
        return;
      }
      const user = getUserData();
      if (!user || !user.loggedIn) return;
      user.avatarUrl = dataUrl;
      setUserData(user);
      refreshMePage();
      showToast('✅ 头像已更新');
    };
    reader.onerror = function () {
      showToast('读取图片失败');
    };
    reader.readAsDataURL(file);
  });
}

// --- 出生日期：年月日滚轮 ---
const BIRTH_WHEEL_ITEM_H = 40;
const BIRTH_WHEEL_MIN_YEAR = 1900;
let birthWheelInternal = 0;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

function maxMonthForYear(y) {
  const t = new Date();
  const ty = t.getFullYear();
  const tm = t.getMonth() + 1;
  if (y < ty) return 12;
  if (y === ty) return tm;
  return 12;
}

function maxDayFor(y, m) {
  let maxD = daysInMonth(y, m);
  const t = new Date();
  if (y === t.getFullYear() && m === t.getMonth() + 1) {
    maxD = Math.min(maxD, t.getDate());
  }
  return maxD;
}

function clampBirthYMD(y, m, d) {
  const t = new Date();
  const ty = t.getFullYear();
  let y2 = Math.min(Math.max(y, BIRTH_WHEEL_MIN_YEAR), ty);
  const maxM = maxMonthForYear(y2);
  let m2 = Math.min(Math.max(1, m), maxM);
  const maxD = maxDayFor(y2, m2);
  let d2 = Math.min(Math.max(1, d), maxD);
  return { y: y2, m: m2, d: d2 };
}

function fillBirthYearColumn() {
  const inner = document.getElementById('birthWheelYearInner');
  if (!inner) return;
  const maxY = new Date().getFullYear();
  inner.innerHTML = '';
  for (let y = BIRTH_WHEEL_MIN_YEAR; y <= maxY; y++) {
    const div = document.createElement('div');
    div.className = 'birth-wheel-item';
    div.textContent = String(y);
    inner.appendChild(div);
  }
}

function fillBirthMonthColumn(y) {
  const inner = document.getElementById('birthWheelMonthInner');
  if (!inner) return;
  const maxM = maxMonthForYear(y);
  inner.innerHTML = '';
  for (let m = 1; m <= maxM; m++) {
    const div = document.createElement('div');
    div.className = 'birth-wheel-item';
    div.textContent = m + '月';
    inner.appendChild(div);
  }
}

function fillBirthDayColumn(y, m) {
  const inner = document.getElementById('birthWheelDayInner');
  if (!inner) return;
  const maxD = maxDayFor(y, m);
  inner.innerHTML = '';
  for (let d = 1; d <= maxD; d++) {
    const div = document.createElement('div');
    div.className = 'birth-wheel-item';
    div.textContent = d + '日';
    inner.appendChild(div);
  }
}

function getWheelIndex(el) {
  const inner = el && el.firstElementChild;
  if (!inner || !inner.children.length) return 0;
  const n = inner.children.length;
  let i = Math.round(el.scrollTop / BIRTH_WHEEL_ITEM_H);
  return Math.max(0, Math.min(i, n - 1));
}

function snapWheel(el) {
  const inner = el && el.firstElementChild;
  if (!inner || !inner.children.length) return;
  const n = inner.children.length;
  let i = Math.round(el.scrollTop / BIRTH_WHEEL_ITEM_H);
  i = Math.max(0, Math.min(i, n - 1));
  const target = i * BIRTH_WHEEL_ITEM_H;
  if (Math.abs(el.scrollTop - target) > 0.5) {
    el.scrollTop = target;
  }
}

/** 程序化滚动（不触发联动逻辑） */
function scrollBirthWheelToIndexSilent(id, index) {
  const el = document.getElementById(id);
  if (!el) return;
  const inner = el.firstElementChild;
  const n = inner && inner.children.length ? inner.children.length : 0;
  const i = Math.max(0, Math.min(index, Math.max(0, n - 1)));
  el.scrollTop = i * BIRTH_WHEEL_ITEM_H;
}

function handleBirthYearScroll() {
  if (birthWheelInternal > 0) return;
  const yEl = document.getElementById('birthWheelYear');
  const mEl = document.getElementById('birthWheelMonth');
  const dEl = document.getElementById('birthWheelDay');
  if (!yEl || !mEl || !dEl) return;
  snapWheel(yEl);
  const y = BIRTH_WHEEL_MIN_YEAR + getWheelIndex(yEl);
  snapWheel(mEl);
  snapWheel(dEl);
  const prevM = getWheelIndex(mEl) + 1;
  const prevD = getWheelIndex(dEl) + 1;
  birthWheelInternal++;
  fillBirthMonthColumn(y);
  const maxM = maxMonthForYear(y);
  const m = Math.min(Math.max(1, prevM), maxM);
  scrollBirthWheelToIndexSilent('birthWheelMonth', m - 1);
  fillBirthDayColumn(y, m);
  const maxD = maxDayFor(y, m);
  const d = Math.min(Math.max(1, prevD), maxD);
  scrollBirthWheelToIndexSilent('birthWheelDay', d - 1);
  setTimeout(function () {
    birthWheelInternal--;
  }, 120);
}

function handleBirthMonthScroll() {
  if (birthWheelInternal > 0) return;
  const yEl = document.getElementById('birthWheelYear');
  const mEl = document.getElementById('birthWheelMonth');
  const dEl = document.getElementById('birthWheelDay');
  if (!yEl || !mEl || !dEl) return;
  snapWheel(yEl);
  snapWheel(mEl);
  const y = BIRTH_WHEEL_MIN_YEAR + getWheelIndex(yEl);
  const m = getWheelIndex(mEl) + 1;
  snapWheel(dEl);
  const prevD = getWheelIndex(dEl) + 1;
  birthWheelInternal++;
  fillBirthDayColumn(y, m);
  const maxD = maxDayFor(y, m);
  const d = Math.min(Math.max(1, prevD), maxD);
  scrollBirthWheelToIndexSilent('birthWheelDay', d - 1);
  setTimeout(function () {
    birthWheelInternal--;
  }, 120);
}

function handleBirthDayScroll() {
  if (birthWheelInternal > 0) return;
  const dEl = document.getElementById('birthWheelDay');
  if (dEl) snapWheel(dEl);
}

let birthWheelYearT;
let birthWheelMonthT;
let birthWheelDayT;

function initBirthWheelScrollListeners() {
  const yEl = document.getElementById('birthWheelYear');
  const mEl = document.getElementById('birthWheelMonth');
  const dEl = document.getElementById('birthWheelDay');
  if (!yEl || yEl._birthWheelScrollInit) return;
  yEl._birthWheelScrollInit = true;
  yEl.addEventListener(
    'scroll',
    function () {
      clearTimeout(birthWheelYearT);
      birthWheelYearT = setTimeout(handleBirthYearScroll, 50);
    },
    { passive: true }
  );
  mEl.addEventListener(
    'scroll',
    function () {
      clearTimeout(birthWheelMonthT);
      birthWheelMonthT = setTimeout(handleBirthMonthScroll, 50);
    },
    { passive: true }
  );
  dEl.addEventListener(
    'scroll',
    function () {
      clearTimeout(birthWheelDayT);
      birthWheelDayT = setTimeout(handleBirthDayScroll, 50);
    },
    { passive: true }
  );
}

function openBirthWheelModal() {
  initBirthWheelScrollListeners();
  const user = getUserData();
  let y;
  let m;
  let d;
  if (user.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(user.birthDate)) {
    const p = user.birthDate.split('-').map(Number);
    y = p[0];
    m = p[1];
    d = p[2];
  } else {
    y = 2000;
    m = 6;
    d = 15;
  }
  const c = clampBirthYMD(y, m, d);
  y = c.y;
  m = c.m;
  d = c.d;
  fillBirthYearColumn();
  fillBirthMonthColumn(y);
  fillBirthDayColumn(y, m);
  document.getElementById('birthWheelOverlay').classList.add('active');
  birthWheelInternal++;
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      scrollBirthWheelToIndexSilent('birthWheelYear', y - BIRTH_WHEEL_MIN_YEAR);
      scrollBirthWheelToIndexSilent('birthWheelMonth', m - 1);
      scrollBirthWheelToIndexSilent('birthWheelDay', d - 1);
      setTimeout(function () {
        birthWheelInternal--;
      }, 150);
    });
  });
}

function closeBirthWheelModal() {
  document.getElementById('birthWheelOverlay').classList.remove('active');
}

function saveBirthFromWheel() {
  const yEl = document.getElementById('birthWheelYear');
  const mEl = document.getElementById('birthWheelMonth');
  const dEl = document.getElementById('birthWheelDay');
  if (yEl) snapWheel(yEl);
  if (mEl) snapWheel(mEl);
  if (dEl) snapWheel(dEl);
  const y = BIRTH_WHEEL_MIN_YEAR + getWheelIndex(yEl);
  const m = getWheelIndex(mEl) + 1;
  const d = getWheelIndex(dEl) + 1;
  const val = y + '-' + pad2(m) + '-' + pad2(d);
  const age = ageFromBirthDate(val);
  if (age == null || age > 150) {
    showToast('请选择有效的出生日期');
    return;
  }
  const user = getUserData();
  user.birthDate = val;
  delete user.age;
  setUserData(user);
  closeBirthWheelModal();
  showToast('✅ 保存成功');
  refreshMePage();
}

// --- 编辑字段（昵称）---
let currentEditField = '';
const fieldConfig = {
  nickname: { title: '编辑昵称', placeholder: '请输入昵称', inputType: 'text' },
};

function openEditField(field) {
  const cfg = fieldConfig[field];
  if (!cfg) return;
  currentEditField = field;
  const user = getUserData();
  document.getElementById('editModalTitle').textContent = cfg.title;
  const input = document.getElementById('editInput');
  input.type = cfg.inputType;
  input.placeholder = cfg.placeholder || '';
  input.value = user[field] || '';
  document.getElementById('editModalOverlay').classList.add('active');
  setTimeout(function () {
    input.focus();
  }, 200);
}

function closeEditModal() {
  document.getElementById('editModalOverlay').classList.remove('active');
  currentEditField = '';
}

function saveEditField() {
  const input = document.getElementById('editInput');
  const val = input.value.trim();
  if (currentEditField === 'nickname') {
    if (!val) {
      showToast('昵称不能为空');
      return;
    }
  }
  const user = getUserData();
  user[currentEditField] = val;
  setUserData(user);
  closeEditModal();
  showToast('✅ 保存成功');
  refreshMePage();
}

// --- 性别 ---
function openGenderModal() {
  document.getElementById('genderModalOverlay').classList.add('active');
}

function closeGenderModal() {
  document.getElementById('genderModalOverlay').classList.remove('active');
}

function saveGender(g) {
  const user = getUserData();
  user.gender = g;
  setUserData(user);
  closeGenderModal();
  showToast('✅ 保存成功');
  refreshMePage();
}

// --- 笔顺动画速度 ---
function openStrokeAnimModal() {
  document.getElementById('strokeAnimModalOverlay').classList.add('active');
}

function closeStrokeAnimModal() {
  document.getElementById('strokeAnimModalOverlay').classList.remove('active');
}

function saveStrokeAnimSpeed(key) {
  if (!STROKE_SPEED_PRESETS[key]) return;
  const user = getUserData();
  if (!user || !user.loggedIn) return;
  user.strokeAnimSpeed = key;
  setUserData(user);
  closeStrokeAnimModal();
  showToast('✅ 已保存');
  refreshMePage();
}

// --- 个性签名 ---
function openBioModal() {
  const user = getUserData();
  const ta = document.getElementById('bioTextarea');
  ta.value = user.bio || '';
  updateBioCounter();
  document.getElementById('bioModalOverlay').classList.add('active');
  setTimeout(function () {
    ta.focus();
    const len = ta.value.length;
    try {
      ta.setSelectionRange(len, len);
    } catch (_) {}
  }, 200);
}

function closeBioModal() {
  document.getElementById('bioModalOverlay').classList.remove('active');
}

function updateBioCounter() {
  const ta = document.getElementById('bioTextarea');
  const n = (ta && ta.value.length) || 0;
  const el = document.getElementById('bioCharCount');
  if (el) el.textContent = String(n);
}

function saveBio() {
  const ta = document.getElementById('bioTextarea');
  let val = ta.value.trim();
  if (ta.value.length > BIO_MAX_LEN) {
    showToast('个性签名最多 ' + BIO_MAX_LEN + ' 字');
    return;
  }
  const user = getUserData();
  user.bio = val;
  setUserData(user);
  closeBioModal();
  showToast('✅ 保存成功');
  refreshMePage();
}

// --- 每日学习目标（数字滚轮，不低于年龄建议，最高 50）---
const DAILY_GOAL_WHEEL_ITEM_H = 40;
let dailyGoalWheelMin = 10;
let dailyGoalWheelMax = 50;

function fillDailyGoalWheel(minV, maxV) {
  dailyGoalWheelMin = minV;
  dailyGoalWheelMax = maxV;
  const inner = document.getElementById('dailyGoalWheelInner');
  if (!inner) return;
  inner.innerHTML = '';
  for (let n = minV; n <= maxV; n++) {
    const div = document.createElement('div');
    div.className = 'birth-wheel-item';
    div.textContent = n + ' 个';
    inner.appendChild(div);
  }
}

function snapDailyGoalWheel() {
  const el = document.getElementById('dailyGoalWheelScroll');
  if (!el) return;
  const inner = el.firstElementChild;
  if (!inner || !inner.children.length) return;
  const n = inner.children.length;
  let i = Math.round(el.scrollTop / DAILY_GOAL_WHEEL_ITEM_H);
  i = Math.max(0, Math.min(i, n - 1));
  el.scrollTop = i * DAILY_GOAL_WHEEL_ITEM_H;
}

function scrollDailyGoalWheelTo(value) {
  const el = document.getElementById('dailyGoalWheelScroll');
  if (!el) return;
  const idx = value - dailyGoalWheelMin;
  const inner = el.firstElementChild;
  const n = inner && inner.children.length ? inner.children.length : 0;
  const i = Math.max(0, Math.min(idx, Math.max(0, n - 1)));
  el.scrollTop = i * DAILY_GOAL_WHEEL_ITEM_H;
}

function getDailyGoalWheelValue() {
  const el = document.getElementById('dailyGoalWheelScroll');
  if (!el) return dailyGoalWheelMin;
  const inner = el.firstElementChild;
  if (!inner || !inner.children.length) return dailyGoalWheelMin;
  const n = inner.children.length;
  let i = Math.round(el.scrollTop / DAILY_GOAL_WHEEL_ITEM_H);
  i = Math.max(0, Math.min(i, n - 1));
  return dailyGoalWheelMin + i;
}

let dailyGoalWheelSnapT;
function initDailyGoalWheelScroll() {
  const el = document.getElementById('dailyGoalWheelScroll');
  if (!el || el._dailyGoalSnapBound) return;
  el._dailyGoalSnapBound = true;
  el.addEventListener(
    'scroll',
    function () {
      clearTimeout(dailyGoalWheelSnapT);
      dailyGoalWheelSnapT = setTimeout(snapDailyGoalWheel, 50);
    },
    { passive: true }
  );
}

function openDailyGoalModal() {
  initDailyGoalWheelScroll();
  const minA = typeof getAgeBasedDailyMin === 'function' ? getAgeBasedDailyMin() : 10;
  const hint = document.getElementById('dailyGoalHint');
  if (hint) {
    hint.textContent =
      '根据年龄，可选 ' +
      minA +
      '～50 个/天。未填出生日期时年龄建议为 10 个/天起。上下滑动选择。';
  }
  fillDailyGoalWheel(minA, 50);
  let current = typeof getDailyLearnTarget === 'function' ? getDailyLearnTarget() : minA;
  if (current < minA) current = minA;
  if (current > 50) current = 50;
  document.getElementById('dailyGoalModalOverlay').classList.add('active');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      scrollDailyGoalWheelTo(current);
    });
  });
}

function closeDailyGoalModal() {
  document.getElementById('dailyGoalModalOverlay').classList.remove('active');
}

function saveDailyGoal() {
  snapDailyGoalWheel();
  const n = getDailyGoalWheelValue();
  const user = getUserData();
  user.dailyLearnGoal = n;
  setUserData(user);
  closeDailyGoalModal();
  showToast('✅ 保存成功');
  refreshMePage();
  if (typeof updateStats === 'function') updateStats();
}

// 点击遮罩关闭编辑弹窗
document.getElementById('editModalOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeEditModal();
});
document.getElementById('birthWheelOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeBirthWheelModal();
});
document.getElementById('genderModalOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeGenderModal();
});
document.getElementById('strokeAnimModalOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeStrokeAnimModal();
});
document.getElementById('bioModalOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeBioModal();
});
document.getElementById('dailyGoalModalOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeDailyGoalModal();
});
document.getElementById('logoutPasswordOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeLogoutPasswordModal();
});
document.getElementById('logoutForceOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeLogoutForceModal();
});

(function initMe() {
  const remember = document.getElementById('loginRememberPassword');
  if (remember) {
    remember.addEventListener('change', syncLoginSubtitle);
    syncLoginSubtitle();
  }
  initAvatarUpload();
  const bioTa = document.getElementById('bioTextarea');
  if (bioTa) {
    bioTa.addEventListener('input', updateBioCounter);
  }
})();

// ============================================================
