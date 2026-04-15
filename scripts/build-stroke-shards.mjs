/**
 * 从 node_modules/hanzi-writer-data 按 data/hanzi-meta.json 中的字头生成分片 JSON，
 * 输出到 stroke-data/（见 .gitignore），构建时复制进 dist，减少移动端逐字请求 CDN。
 *
 * 分片策略：按 Unicode 排序后每 CHUNK 字合并为一个 JSON，首访某字时只拉取所在分片一次并缓存。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const CHUNK = 220;
const outRoot = join(root, 'stroke-data');
const shardsDir = join(outRoot, 'shards');
const pkgDir = join(root, 'node_modules', 'hanzi-writer-data');

const metaPath = join(root, 'data', 'hanzi-meta.json');
if (!existsSync(metaPath)) {
  console.error('Missing data/hanzi-meta.json');
  process.exit(1);
}
if (!existsSync(pkgDir)) {
  console.error('Missing hanzi-writer-data. Run: npm install');
  process.exit(1);
}

const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const keys = Object.keys(meta).sort();

mkdirSync(shardsDir, { recursive: true });

const map = Object.create(null);
let missing = 0;

for (let i = 0; i < keys.length; i += CHUNK) {
  const slice = keys.slice(i, i + CHUNK);
  const shardId = Math.floor(i / CHUNK);
  const idStr = String(shardId).padStart(2, '0');
  const payload = Object.create(null);

  for (const ch of slice) {
    const fp = join(pkgDir, `${ch}.json`);
    if (!existsSync(fp)) {
      missing++;
      console.warn('missing stroke file for:', ch);
      continue;
    }
    payload[ch] = JSON.parse(readFileSync(fp, 'utf8'));
    map[ch] = shardId;
  }

  writeFileSync(join(shardsDir, `${idStr}.json`), JSON.stringify(payload));
}

writeFileSync(join(outRoot, 'stroke-shard-map.json'), JSON.stringify(map));

const shardCount = Math.ceil(keys.length / CHUNK);
console.log(
  `stroke-data: ${shardCount} shards, ${Object.keys(map).length} chars mapped, missing ${missing}`
);
