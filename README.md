# 汉字笔顺学堂

一款专为儿童设计的汉字笔顺学习静态网页：逐笔动画、分类练习、本地进度与连续打卡。字表与拼音释义由 `data/*.json` 提供；笔顺字形数据来自 [Hanzi Writer](https://hanziwriter.org/) / [hanzi-writer-data](https://www.npmjs.com/package/hanzi-writer-data)（在线或本地 `hanzi-data/`）。

## 入口与数据

| 资源 | 说明 |
|------|------|
| [index.html](index.html) | 唯一页面入口 |
| [data/hanzi-meta.json](data/hanzi-meta.json) | 约 **3500** 个汉字的拼音、释义（元数据） |
| [data/categories.json](data/categories.json) | **已学习** →「入门百字」「常用三百」→ 主题类 →「进阶」16 组（每组≤200 字）；无「全部」汇总项 |
| `stroke-data/`（构建生成） | 笔顺 SVG 数据分片 + `stroke-shard-map.json`；由 `npm run build:stroke-data` 从 `hanzi-writer-data` 生成，默认不提交 |
| Hanzi Writer 脚本 | [index.html](index.html) 默认使用 jsDelivr CDN；也可改为本地 `js/hanzi-writer.min.js`。 |

「入门百字」「常用三百」字表与旧版一致；其余字头按进阶组与主题类浏览。默认进入「已学习」，可在二级标签中按原分类筛选已掌握的字。

## 本地运行方式

本页通过 `fetch()` 加载 `data/*.json`，**不能**用 `file://` 直接双击打开（浏览器会拦截本地文件请求）。请使用任意一种 **HTTP 静态服务**：

**推荐（开发体验）**：安装 [Node.js](https://nodejs.org/) 后：

```bash
npm install
npm run dev
```

浏览器访问 Vite 提示的地址（默认 `http://localhost:5173`）。开发服务器已配置将项目根目录下的 `data/` 映射到 URL `/data/`，与 `fetch('data/hanzi-meta.json')` 一致。

**不安装 Node 时**：在仓库根目录执行：

```bash
python3 -m http.server 8080
```

然后打开 `http://127.0.0.1:8080/`（确保 `data/`、`js/`、`css/` 与 `index.html` 在同一服务根下）。

**生产构建**：

```bash
npm run build
npm run preview
```

构建结果在 `dist/`：`data/` 与 `stroke-data/`（笔顺分片）会一并复制。

## GitHub Pages 部署

本仓库含 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)：向 `main` 推送后会执行 **`npm run build`**（含 `build:stroke-data` 从 `hanzi-writer-data` 生成分片，再 `vite build` 将 `stroke-data/` 复制到 `dist/`）。工作流中 **Verify stroke-data in dist** 步骤会校验 `dist/stroke-data/` 存在且映射非空，否则构建失败，避免线上缺少笔顺 JSON、手机端无法全量下载。

1. 在 GitHub 打开本仓库 **Settings → Pages**。
2. **Build and deployment** 的 **Source** 选择 **GitHub Actions**（不要选 branch）。
3. 推送 `main` 后，在 **Actions** 中查看 **Deploy GitHub Pages** 是否成功（绿色且含 **Verify stroke-data in dist** 通过）。

站点地址一般为：`https://<你的用户名>.github.io/hanzi-stroke-learning/`。若你**重命名了仓库**，请同步修改工作流里的 `VITE_BASE_PATH`（或改为与你的仓库名一致的路径前缀）。

## 进度与存储

| localStorage 键 | 含义 |
|-----------------|------|
| `stars` | 星星总数 |
| `learnedChars` | 已学汉字列表（JSON 数组） |
| `streak` | 连续学习日计数 |
| `lastActiveDate` | 上次产生学习行为的本地日期（`YYYY-MM-DD`） |
| `hanzi_user` | 「我的」页本地用户资料（演示用，**不保存密码**） |

已连续学习日规则：在**不同**本地日历日打开任意字头学习时，若上一日为昨天则 streak+1，否则重置为 1；同一自然日内多次学习不重复增加。

已从旧键 `userStars` / `userLearned` 自动合并星星数（若有），并清除旧键。

## 笔顺数据（推荐：分片打包）

生产构建会执行 `npm run build:stroke-data`：根据 `data/hanzi-meta.json` 从依赖包 `hanzi-writer-data` 生成 **`stroke-data/`**（字表映射 + 每约 220 字一个 JSON 分片，整片缓存），并随 `vite build` 复制到 `dist/stroke-data/`。**首次进入页面**会在顶栏下方显示笔顺资源加载进度条，并拉齐 map 与全部分片到内存（加载完成前不可操作学习区）；完成后，字表内且落在分片中的字将**跳过全屏加载层**，直接打开学习弹层。若无 `stroke-data`（仅本地未生成分片），则仍回退为点字后再拉 map/分片或 CDN 单字。

- **GitHub Actions** 已在 `npm run build` 中自动生成分片，无需手工操作。
- **本地开发**：可先执行 `npm run build:stroke-data` 再 `npm run dev`，与线上一致走分片；不生成时仍回退到下方「单字 CDN」。

## 笔顺数据单字离线包（可选）

将 `hanzi-writer-data` 解压到仓库根目录的 `hanzi-data/`（与 `.gitignore` 一致，不提交），每个字对应 `hanzi-data/<字符>.json`。无分片、无单字文件时从 jsDelivr CDN 拉取。

可用：

```bash
npm pack hanzi-writer-data@2.0
tar -xzf hanzi-writer-data-*.tgz
mv package/*.json ./hanzi-data/
```

## 开发与检验

| 命令 | 说明 |
|------|------|
| `npm run dev` | Vite 开发服务器 |
| `npm run build` | 构建到 `dist/` |
| `npm test` | Vitest 单元测试（如 `ProgressStore` 连续日逻辑） |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

从现有 `js/learn.js` **重新生成**字表 JSON（一般不需执行，除非改了旧内嵌数据）：

```bash
python3 scripts/extract_learn_data.py
```

## 技术栈

- Hanzi Writer、原生 HTML/CSS/JavaScript（无前端框架）
- SVG 田字格、`localStorage` 持久化、Web Speech API 朗读（[`js/voice.js`](js/voice.js)）
- 可选工程链：Vite、Vitest、ESLint、Prettier（[`package.json`](package.json)）

## 语音朗读（浏览器说明）

朗读依赖浏览器的 **Speech Synthesis（语音合成）**，无需服务器，但**不同环境差异很大**：

- **推荐**：手机使用 **Safari（iOS）** 或 **Chrome（Android）** 等**系统浏览器**直接打开本站；请关闭静音、调高媒体音量，并在系统中安装/启用**中文**语音（部分机型在「设置 → 辅助功能 → 朗读内容 / 语音」或「语言与地区」中管理）。
- **微信、QQ、微博等应用内浏览器**：常对网页语音有限制，可能出现**无声**；若遇此情况，请用右上角菜单在**系统浏览器**中打开。
- 页面会在检测到**无中文语音**或**合成失败**时通过 Toast 提示；开发调试可在控制台查看 `Voice.getVoiceStatus()`（返回是否已加载语音列表、是否匹配到中文音色等）。
- 朗读优先使用字表中的**拼音**（与多音字标注一致），以减少浏览器 TTS 把汉字读错音的情况；仍受本机语音引擎影响。
- **自动播报**在学习弹层展开后约 **3 秒**触发，且仅在笔顺加载成功、弹层已显示之后才会安排，避免出现「有声无窗」。若自动播报因浏览器策略无声，可点弹层内「朗读」手动收听。

## 代码结构（概要）

- [`js/progressStore.js`](js/progressStore.js)：星星、已学列表、连续日与最后一次活动日期的统一读写
- [`js/hanzi-adapter.js`](js/hanzi-adapter.js)：封装 `HanziWriter.create` 与笔顺 JSON 加载
- [`js/learn.js`](js/learn.js)：学习页网格、弹层与笔顺交互
- [`js/me.js`](js/me.js)：`hanzi_user` 资料；统计数字与首页同源（`ProgressStore`）
- [`js/app.js`](js/app.js)：Toast、Tab、启动时调用异步 `init()`

## License

MIT
