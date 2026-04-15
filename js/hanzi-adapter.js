/**
 * Hanzi Writer 实例创建与笔顺数据加载（与页面 state 解耦，通过 handlers 回传）
 */
const HanziAdapter = (function () {
  function buildCharDataLoader() {
    return function (char, onComplete) {
      var base = typeof getAppBaseUrl === "function" ? getAppBaseUrl() : new URL(".", window.location.href);
      var localUrl = new URL("hanzi-data/" + encodeURIComponent(char) + ".json", base).href;
      const cdnUrl =
        'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/' +
        encodeURIComponent(char) +
        '.json';
      fetch(localUrl)
        .then(function (r) {
          if (!r.ok) throw new Error('local miss');
          return r.json();
        })
        .catch(function () {
          return fetch(cdnUrl).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          });
        })
        .then(function (data) {
          onComplete(data);
        })
        .catch(function (err) {
          console.warn('笔顺数据加载失败:', char, err);
          var hint = document.getElementById('loadingHint');
          if (hint) hint.textContent = '该字数据暂不可用';
        });
    };
  }

  /**
   * @param {string} containerId - HanziWriter 挂载点 id
   * @param {string} char
   * @param {object} handlers - { onLoadCharDataSuccess, onLoadCharDataError }
   */
  function create(containerId, char, handlers) {
    return HanziWriter.create(containerId, char, {
      width: 220,
      height: 220,
      padding: 10,
      showOutline: true,
      outlineColor: '#DDDDEE',
      strokeColor: '#3A3A5C',
      radicalColor: '#3A3A5C',
      highlightColor: '#FF5A5F',
      showCharacter: false,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 400,
      charDataLoader: buildCharDataLoader(),
      onLoadCharDataSuccess: handlers.onLoadCharDataSuccess,
      onLoadCharDataError: handlers.onLoadCharDataError,
    });
  }

  return { create, buildCharDataLoader };
})();

window.HanziAdapter = HanziAdapter;
