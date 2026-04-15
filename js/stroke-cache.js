/**
 * 笔顺静态 JSON：浏览器 Cache API 持久缓存 + 启动时后台预取分片。
 * 同域 stroke-data 首次拉取后写入 caches，下次访问直接命中，无需再下。
 * 需 HTTPS 或 localhost（与 Service Worker 同源策略一致）。
 */
const StrokeCache = (function () {
  var CACHE_NAME = 'hanzi-stroke-assets-v1';
  var inflight = Object.create(null);
  var prefetchStarted = false;

  function fetchWithCache(url) {
    var u = typeof url === 'string' ? url : String(url.href || url);
    if (inflight[u]) return inflight[u];

    var inner;
    if (!('caches' in window)) {
      inner = fetch(u, { credentials: 'same-origin' });
    } else {
      inner = caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(u).then(function (hit) {
          if (hit) return hit;
          return fetch(u, { credentials: 'same-origin' }).then(function (resp) {
            if (resp && resp.ok) {
              try {
                if (resp.type === 'basic' || resp.type === 'cors') {
                  cache.put(u, resp.clone());
                }
              } catch (_) {
                /* 跨域 opaque 等不可缓存时忽略 */
              }
            }
            return resp;
          });
        });
      });
    }

    inflight[u] = Promise.resolve(inner).finally(function () {
      delete inflight[u];
    });
    return inflight[u];
  }

  function fetchJsonCached(url) {
    return fetchWithCache(url).then(function (r) {
      if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
      return r.json();
    });
  }

  /**
   * 进入页面后立即：拉取 shard-map + 后台顺序拉取全部分片（写入持久缓存）。
   * 不阻塞首屏；若某分片失败则静默（用户点该字时仍走 HanziAdapter 回退）。
   */
  function prefetchStrokeAssets(base) {
    if (prefetchStarted) return;
    prefetchStarted = true;
    try {
      base =
        base ||
        (typeof getAppBaseUrl === 'function' ? getAppBaseUrl() : new URL('.', window.location.href));
    } catch (_) {
      return;
    }

    var mapUrl = new URL('stroke-data/stroke-shard-map.json', base).href;
    fetchJsonCached(mapUrl)
      .then(function (map) {
        if (!map || typeof map !== 'object') return;
        if (!window.__strokeShardMap) window.__strokeShardMap = map;
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
        var CONC = 6;
        var i = 0;
        function runBatch() {
          var slice = shardIds.slice(i, i + CONC);
          i += CONC;
          if (slice.length === 0) return Promise.resolve();
          return Promise.all(
            slice.map(function (sid) {
              var idStr = String(sid).padStart(2, '0');
              var surl = new URL('stroke-data/shards/' + idStr + '.json', base).href;
              return fetchWithCache(surl).catch(function () {});
            })
          ).then(runBatch);
        }
        return runBatch();
      })
      .catch(function () {
        /* 无 stroke-data 时静默，走 CDN 单字 */
      });
  }

  return {
    CACHE_NAME: CACHE_NAME,
    fetchWithCache: fetchWithCache,
    fetchJsonCached: fetchJsonCached,
    prefetchStrokeAssets: prefetchStrokeAssets,
  };
})();

window.StrokeCache = StrokeCache;
