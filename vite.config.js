import { readFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(__dirname, 'data');

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
    },
  };
}

export default defineConfig({
  root: '.',
  appType: 'mpa',
  publicDir: false,
  plugins: [serveProjectDataDir(), copyDataToDist()],
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
