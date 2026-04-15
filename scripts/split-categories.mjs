/**
 * 从旧版 categories.json 生成：去掉「全部」、拆分「进阶三千」为每组≤200字、
 * 前置「已学习」占位。入门百字 / 常用三百 列表原样保留。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const raw = JSON.parse(readFileSync(join(root, 'data/categories.json'), 'utf8'));

const CHUNK = 200;
const g1 = raw.find((x) => x.id === 'g1');
const g2 = raw.find((x) => x.id === 'g2');
const g3 = raw.find((x) => x.id === 'g3');
const others = raw.filter((x) => !['all', 'g1', 'g2', 'g3'].includes(x.id));

if (!g1 || !g2 || !g3) throw new Error('missing g1/g2/g3');

const g3chunks = [];
for (let i = 0; i < g3.chars.length; i += CHUNK) {
  const part = g3.chars.slice(i, i + CHUNK);
  const n = Math.floor(i / CHUNK) + 1;
  const num = String(n).padStart(2, '0');
  g3chunks.push({
    id: `g3-${num}`,
    name: `进阶·第${n}组`,
    emoji: '📚',
    chars: part,
  });
}

// 顺序：已学习 → 入门/常用 → 主题类（个性化）→ 进阶分组（置后）
const out = [
  { id: 'learned', name: '已学习', emoji: '✅', chars: [] },
  g1,
  g2,
  ...others,
  ...g3chunks,
];

writeFileSync(join(root, 'data/categories.json'), JSON.stringify(out, null, 0));
console.log(
  'categories:',
  out.length,
  'g3 groups:',
  g3chunks.length,
  'chars g3 total:',
  g3.chars.length
);
