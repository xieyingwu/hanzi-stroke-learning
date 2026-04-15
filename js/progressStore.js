/**
 * 统一学习进度持久化（localStorage 单一切口）
 * 键名：stars, learnedChars, streak, lastActiveDate（YYYY-MM-DD 本地日历）
 */
const ProgressStore = (function () {
  const KEY_STARS = 'stars';
  const KEY_LEARNED = 'learnedChars';
  const KEY_STREAK = 'streak';
  const KEY_LAST = 'lastActiveDate';
  /** 今日新学会字数（日历日切换时清零） */
  const KEY_DAILY_DATE = 'dailyNewLearnedDate';
  const KEY_DAILY_NEW_COUNT = 'dailyNewLearnedCount';

  const LEGACY_USER_STARS = 'userStars';
  const LEGACY_USER_LEARNED = 'userLearned';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function todayYMD() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 与 last 相比，today 晚多少「日历日」（同用 UTC 午夜的日期差） */
  function calendarDaysBetween(todayYmd, lastYmd) {
    if (!lastYmd) return Infinity;
    const [ty, tm, td] = todayYmd.split('-').map(Number);
    const [ly, lm, ld] = lastYmd.split('-').map(Number);
    const t = Date.UTC(ty, tm - 1, td);
    const l = Date.UTC(ly, lm - 1, ld);
    return Math.round((t - l) / 86400000);
  }

  let migrated = false;
  function migrateLegacyOnce() {
    if (migrated) return;
    migrated = true;

    let stars = parseInt(localStorage.getItem(KEY_STARS) || '0', 10) || 0;
    const legacyStars = parseInt(localStorage.getItem(LEGACY_USER_STARS) || '0', 10) || 0;
    if (legacyStars > stars) stars = legacyStars;
    localStorage.setItem(KEY_STARS, String(stars));

    localStorage.removeItem(LEGACY_USER_STARS);
    localStorage.removeItem(LEGACY_USER_LEARNED);
  }

  function readLearnedArray() {
    try {
      const raw = localStorage.getItem(KEY_LEARNED);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function load() {
    migrateLegacyOnce();
    const stars = parseInt(localStorage.getItem(KEY_STARS) || '0', 10) || 0;
    const learned = readLearnedArray();
    let streak = parseInt(localStorage.getItem(KEY_STREAK) || '0', 10);
    if (!streak) streak = 1;
    const lastActiveDate = localStorage.getItem(KEY_LAST) || '';

    return {
      stars,
      learned,
      streak,
      lastActiveDate,
    };
  }

  function persistSnapshot(s) {
    localStorage.setItem(KEY_STARS, String(s.stars));
    localStorage.setItem(KEY_LEARNED, JSON.stringify(s.learned));
    localStorage.setItem(KEY_STREAK, String(s.streak));
    if (s.lastActiveDate) localStorage.setItem(KEY_LAST, s.lastActiveDate);
    else localStorage.removeItem(KEY_LAST);
  }

  /**
   * 当日首次学习行为时更新连续天数：同一天不重复；连续昨天 +1；否则从 1 开始。
   * @returns {{ streak: number, lastActiveDate: string }} 更新后的字段
   */
  function applyActivityForStreak(prev) {
    const today = todayYMD();
    const last = prev.lastActiveDate || '';
    if (last === today) {
      return { streak: prev.streak, lastActiveDate: last };
    }
    const gap = calendarDaysBetween(today, last);
    let streak = prev.streak || 1;
    if (!last) {
      streak = 1;
    } else if (gap === 1) {
      streak = streak + 1;
    } else {
      streak = 1;
    }
    return { streak, lastActiveDate: today };
  }

  function recordLearningActivity() {
    const snap = load();
    const updated = applyActivityForStreak(snap);
    snap.streak = updated.streak;
    snap.lastActiveDate = updated.lastActiveDate;
    persistSnapshot(snap);
    return snap;
  }

  function saveStarsAndLearned(stars, learned) {
    const snap = load();
    snap.stars = stars;
    snap.learned = learned;
    persistSnapshot(snap);
  }

  function getTodayNewLearnedCount() {
    migrateLegacyOnce();
    const today = todayYMD();
    const saved = localStorage.getItem(KEY_DAILY_DATE) || '';
    if (saved !== today) {
      localStorage.setItem(KEY_DAILY_DATE, today);
      localStorage.setItem(KEY_DAILY_NEW_COUNT, '0');
      return 0;
    }
    return parseInt(localStorage.getItem(KEY_DAILY_NEW_COUNT) || '0', 10) || 0;
  }

  /** 新学会一字（当日首次记入「已学」时调用） */
  function incrementTodayNewLearned() {
    getTodayNewLearnedCount();
    const n = parseInt(localStorage.getItem(KEY_DAILY_NEW_COUNT) || '0', 10) || 0;
    const next = n + 1;
    localStorage.setItem(KEY_DAILY_NEW_COUNT, String(next));
    return next;
  }

  return {
    load,
    persistSnapshot,
    todayYMD,
    calendarDaysBetween,
    applyActivityForStreak,
    recordLearningActivity,
    saveStarsAndLearned,
    /** 供「我的」页与顶栏使用，与 learn 同源 */
    getStars() {
      return load().stars;
    },
    getLearnedCount() {
      return load().learned.length;
    },
    getStreak() {
      return load().streak;
    },
    getTodayNewLearnedCount,
    incrementTodayNewLearned,
    /** 清空学习进度（星星、已学列表、连续天数等），供退出登录等场景 */
    clearAll() {
      migrateLegacyOnce();
      persistSnapshot({
        stars: 0,
        learned: [],
        streak: 1,
        lastActiveDate: '',
      });
      localStorage.removeItem(KEY_DAILY_DATE);
      localStorage.removeItem(KEY_DAILY_NEW_COUNT);
    },
    __testHelpers: {
      todayYMD,
      calendarDaysBetween,
      applyActivityForStreak,
    },
  };
})();

window.ProgressStore = ProgressStore;
