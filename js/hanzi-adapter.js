/**
 * Hanzi Writer 实例创建与笔顺数据加载（与页面 state 解耦，通过 handlers 回传）
 *
 * 优先：stroke-data/stroke-shard-map.json + stroke-data/shards/xx.json（构建自 hanzi-writer-data 分片，整片缓存）
 * 回退：本地 hanzi-data/<字>.json → jsDelivr 单字请求
 */
const HanziAdapter = (function () {
  var shardPayloadCache = Object.create(null);
  var shardInflight = Object.create(null);
  var mapLoadPromise = null;

  function getBase() {
    return typeof getAppBaseUrl === 'function' ? getAppBaseUrl() : new URL('.', window.location.href);
  }

  function fetchShardMap(base) {
    if (window.__strokeShardMap) return Promise.resolve(window.__strokeShardMap);
    if (mapLoadPromise) return mapLoadPromise;
    mapLoadPromise = fetch(new URL('stroke-data/stroke-shard-map.json', base).href)
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (m) {
        if (m) window.__strokeShardMap = m;
        return m;
      })
      .finally(function () {
        mapLoadPromise = null;
      });
    return mapLoadPromise;
  }

  function loadShardPayload(base, shardId) {
    if (shardPayloadCache[shardId] !== undefined) {
      return Promise.resolve(shardPayloadCache[shardId]);
    }
    if (shardInflight[shardId]) return shardInflight[shardId];
    var idStr = String(shardId).padStart(2, '0');
    var url = new URL('stroke-data/shards/' + idStr + '.json', base).href;
    shardInflight[shardId] = fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('shard ' + shardId);
        return r.json();
      })
      .then(function (data) {
        shardPayloadCache[shardId] = data;
        delete shardInflight[shardId];
        return data;
      })
      .catch(function (e) {
        delete shardInflight[shardId];
        throw e;
      });
    return shardInflight[shardId];
  }

  function loadLegacy(char, onComplete) {
    var base = getBase();
    var localUrl = new URL('hanzi-data/' + encodeURIComponent(char) + '.json', base).href;
    var cdnUrl =
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
  }

  function buildCharDataLoader() {
    return function (char, onComplete) {
      var base = getBase();
      fetchShardMap(base)
        .then(function (map) {
          if (map && map[char] !== undefined) {
            var sid = map[char];
            return loadShardPayload(base, sid).then(function (payload) {
              var data = payload[char];
              if (data) {
                onComplete(data);
                return;
              }
              throw new Error('char missing in shard');
            });
          }
          throw new Error('no bundled stroke map');
        })
        .catch(function () {
          loadLegacy(char, onComplete);
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
      /* 略慢于默认：倍率<1 放慢单笔书写；笔画间停顿略增，便于跟读 */
      strokeAnimationSpeed: 0.65,
      delayBetweenStrokes: 550,
      charDataLoader: buildCharDataLoader(),
      onLoadCharDataSuccess: handlers.onLoadCharDataSuccess,
      onLoadCharDataError: handlers.onLoadCharDataError,
    });
  }

  return { create, buildCharDataLoader };
})();

window.HanziAdapter = HanziAdapter;
