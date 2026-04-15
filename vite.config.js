import { readFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(__dirname, 'data');
const strokeDataDir = resolve(__dirname, 'stroke-data');
const jsDir = resolve(__dirname, 'js');

function serveProjectDataDir() {
  return {
    name: 'serve-root-data-dir',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/data/')) {
          next();
          return;
        }
        const name = req.url.replace(/^\/data\//, '').replace(/\.\./g, '');
        if (!name || name.includes('..')) {
          next();
          return;
        }
        const fp = join(dataDir, name);
        if (!existsSync(fp)) {
          next();
          return;
        }
        const buf = readFileSync(fp);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(buf);
      });
    },
  };
}

function copyDataToDist() {
  return {
    name: 'copy-data-to-dist',
    closeBundle() {
      const out = join(__dirname, 'dist', 'data');
      if (existsSync(dataDir)) {
        mkdirSync(out, { recursive: true });
        cpSync(dataDir, out, { recursive: true });
      }
      const strokeOut = join(__dirname, 'dist', 'stroke-data');
      if (existsSync(strokeDataDir)) {
        mkdirSync(strokeOut, { recursive: true });
        cpSync(strokeDataDir, strokeOut, { recursive: true });
      }
      const jsOut = join(__dirname, 'dist', 'js');
      if (existsSync(jsDir)) {
        mkdirSync(jsOut, { recursive: true });
        cpSync(jsDir, jsOut, { recursive: true });
      }
    },
  };
}

function serveStrokeDataDir() {
  return {
    name: 'serve-stroke-data-dir',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/stroke-data/')) {
          next();
          return;
        }
        const name = req.url.replace(/^\/stroke-data\//, '').replace(/\.\./g, '');
        if (!name || name.includes('..')) {
          next();
          return;
        }
        const fp = join(strokeDataDir, name);
        if (!existsSync(fp)) {
          next();
          return;
        }
        const buf = readFileSync(fp);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.end(buf);
      });
    },
  };
}

// GitHub Pages 项目站路径为 /<仓库名>/，通过环境变量 VITE_BASE_PATH 在 CI 中传入
const pagesBase = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base: pagesBase,
  root: '.',
  appType: 'mpa',
  publicDir: false,
  plugins: [serveProjectDataDir(), serveStrokeDataDir(), copyDataToDist()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
