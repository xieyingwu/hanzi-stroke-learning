# 汉字笔顺学堂

一款专为儿童设计的汉字笔顺学习静态网页：逐笔动画、分类练习、本地进度与连续打卡。字表与拼音释义由 `data/*.json` 提供；笔顺字形数据来自 [Hanzi Writer](https://hanziwriter.org/) / [hanzi-writer-data](https://www.npmjs.com/package/hanzi-writer-data)（在线或本地 `hanzi-data/`）。

## 入口与数据

| 资源 | 说明 |
|------|------|
| [index.html](index.html) | 唯一页面入口 |
| [data/hanzi-meta.json](data/hanzi-meta.json) | 约 **3500** 个汉字的拼音、释义（元数据） |
| [data/categories.json](data/categories.json) | **17** 条分类（含「全部」+ 16 类主题/分级字表） |
| `js/hanzi-writer.min.js` | Hanzi Writer 库；若仓库中无此文件，请从 [hanziwriter.org](https://hanziwriter.org/) 或 npm 包 `hanzi-writer` 中取构建后的脚本，并保持与 [index.html](index.html) 中引用路径一致。 |

分类含义与规模与旧版「3500 字 / 16 类主题」一致：「全部」汇总元数据中的全部字头。

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

构建结果在 `dist/`，字表目录会一并复制到 `dist/data/`。

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

## 笔顺数据离线包（可选）

将 `hanzi-writer-data` 解压到仓库根目录的 `hanzi-data/`（与 `.gitignore` 一致，不提交），每个字对应 `hanzi-data/<字符>.json`。无本地文件时从 jsDelivr CDN 拉取。

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

## 代码结构（概要）

- [`js/progressStore.js`](js/progressStore.js)：星星、已学列表、连续日与最后一次活动日期的统一读写
- [`js/hanzi-adapter.js`](js/hanzi-adapter.js)：封装 `HanziWriter.create` 与笔顺 JSON 加载
- [`js/learn.js`](js/learn.js)：学习页网格、弹层与笔顺交互
- [`js/me.js`](js/me.js)：`hanzi_user` 资料；统计数字与首页同源（`ProgressStore`）
- [`js/app.js`](js/app.js)：Toast、Tab、启动时调用异步 `init()`

## License

MIT
