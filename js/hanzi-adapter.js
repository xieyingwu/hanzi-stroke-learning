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

  function fetchMapUrl(base) {
    return new URL('stroke-data/stroke-shard-map.json', base).href;
  }

  function fetchShardMap(base) {
    if (window.__strokeShardMap) return Promise.resolve(window.__strokeShardMap);
    if (mapLoadPromise) return mapLoadPromise;
    var href = fetchMapUrl(base);
    mapLoadPromise = (
      window.StrokeCache && typeof StrokeCache.fetchJsonCached === 'function'
        ? StrokeCache.fetchJsonCached(href)
        : fetch(href).then(function (r) {
            if (!r.ok) return null;
            return r.json();
          })
    )
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
    var loadPromise =
      window.StrokeCache && typeof StrokeCache.fetchJsonCached === 'function'
        ? StrokeCache.fetchJsonCached(url)
        : fetch(url).then(function (r) {
            if (!r.ok) throw new Error('shard ' + shardId);
            return r.json();
          });
    shardInflight[shardId] = loadPromise
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

  /**
   * Hanzi Writer 3.x：charDataLoader(char, resolve, reject)
   * 失败必须 reject，否则加载 Promise 永不结束，弹层不会打开。
   */
  function loadLegacy(char, resolve, reject) {
    var base = getBase();
    var localUrl = new URL('hanzi-data/' + encodeURIComponent(char) + '.json', base).href;
    var cdnUrl =
      'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/' +
      encodeURIComponent(char) +
      '.json';
    var fetchLocal =
      window.StrokeCache && typeof StrokeCache.fetchWithCache === 'function'
        ? StrokeCache.fetchWithCache
        : fetch.bind(window);
    fetchLocal(localUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('local miss');
        return r.json();
      })
      .catch(function () {
        /* CDN 单字保持原生 fetch，避免跨域 opaque 响应无法读 JSON / 写入 Cache */
        return fetch(cdnUrl).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        });
      })
      .then(function (data) {
        resolve(data);
      })
      .catch(function (err) {
        console.warn('笔顺数据加载失败:', char, err);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  }

  /**
   * 首屏拉取 shard-map + 全部分片 JSON 并写入内存缓存，保证后续点字时笔顺数据立即可用。
   * @param {string|URL|undefined} base - 与 getAppBaseUrl 一致
   * @param {(ratio: number) => void} [onProgress] - 0～1
   * @returns {Promise<{ ok: boolean, shardCount?: number, reason?: string }>}
   */
  function warmStrokePacksWithProgress(base, onProgress) {
    var b = base || getBase();
    if (typeof onProgress === 'function') onProgress(0);
    return fetchShardMap(b)
      .then(function (map) {
        if (!map || typeof map !== 'object') {
          if (typeof onProgress === 'function') onProgress(1);
          return { ok: false, reason: 'no_map' };
        }
        var seen = Object.create(null);
        var k;
        for (k in map) {
          if (Object.prototype.hasOwnProperty.call(map, k)) {
            seen[map[k]] = true;
          }
        }
        var shardIds = Object.keys(seen)
          .map(function (x) {
            return parseInt(x, 10);
          })
          .filter(function (n) {
            return !isNaN(n);
          })
          .sort(function (a, b) {
            return a - b;
          });
        var total = 1 + shardIds.length;
        var done = 1;
        if (typeof onProgress === 'function') onProgress(done / total);
        return Promise.all(
          shardIds.map(function (sid) {
            return loadShardPayload(b, sid).then(function (payload) {
              done++;
              if (typeof onProgress === 'function') onProgress(done / total);
              return payload;
            });
          })
        ).then(function () {
          if (typeof onProgress === 'function') onProgress(1);
          return { ok: true, shardCount: shardIds.length };
        });
      })
      .catch(function (e) {
        console.warn('笔顺包预热失败', e);
        if (typeof onProgress === 'function') onProgress(1);
        return { ok: false, reason: String(e) };
      });
  }

  function buildCharDataLoader() {
    return function (char, resolve, reject) {
      var base = getBase();
      fetchShardMap(base)
        .then(function (map) {
          if (map && map[char] !== undefined) {
            var sid = map[char];
            return loadShardPayload(base, sid).then(function (payload) {
              var data = payload[char];
              if (data) {
                resolve(data);
                return;
              }
              throw new Error('char missing in shard');
            });
          }
          throw new Error('no bundled stroke map');
        })
        .catch(function () {
          loadLegacy(char, resolve, reject);
        });
    };
  }

  /**
   * @param {string} containerId - HanziWriter 挂载点 id
   * @param {string} char
   * @param {object} handlers - { onLoadCharDataSuccess, onLoadCharDataError }
   */
  function create(containerId, char, handlers) {
    var speedOpts =
      typeof getStrokeAnimWriterOptions === 'function'
        ? getStrokeAnimWriterOptions()
        : { delayBetweenStrokes: 800, strokeAnimationSpeed: 0.5 };
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
      strokeAnimationSpeed: speedOpts.strokeAnimationSpeed,
      delayBetweenStrokes: speedOpts.delayBetweenStrokes,
      charDataLoader: buildCharDataLoader(),
      onLoadCharDataSuccess: handlers.onLoadCharDataSuccess,
      onLoadCharDataError: handlers.onLoadCharDataError,
    });
  }

  return { create, buildCharDataLoader, warmStrokePacksWithProgress };
})();

window.HanziAdapter = HanziAdapter;
