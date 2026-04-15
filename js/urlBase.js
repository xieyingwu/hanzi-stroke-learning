/**
 * 当前应用根目录 URL（含尾斜杠）。
 * GitHub Pages 子路径下若 pathname 为 /仓库名（无尾斜杠），相对路径 data/、hanzi-data/
 * 会被错误解析到 github.io 根目录，导致字表 404。
 */
function getAppBaseUrl() {
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
