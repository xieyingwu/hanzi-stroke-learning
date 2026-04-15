/**
 * 当前应用根目录 URL（含尾斜杠）。
 * GitHub Pages 子路径下若 pathname 为 /仓库名（无尾斜杠），相对路径 data/、stroke-data/
 * 会被错误解析到 github.io 根目录，导致字表 404。
 * 构建时由 Vite 注入 meta[name=app-base-path]（与 VITE_BASE_PATH 一致），微信等内置浏览器里 pathname
 * 可能异常，优先用 meta 可保证 stroke-data 请求落在正确子路径。
 */
function getAppBaseUrl() {
  var meta = document.querySelector('meta[name="app-base-path"]');
  if (meta && meta.content) {
    var mc = String(meta.content).trim();
    if (mc && mc !== '/') {
      try {
        return new URL(mc, window.location.origin);
      } catch (e) {
        /* fall through */
      }
    }
  }
  var path = window.location.pathname;
  if (!path.endsWith('/')) {
    if (/\.[a-z0-9]+$/i.test(path)) {
      path = path.replace(/\/[^/]+$/, '/');
    } else {
      path = path + '/';
    }
  }
  return new URL(path, window.location.origin);
}
