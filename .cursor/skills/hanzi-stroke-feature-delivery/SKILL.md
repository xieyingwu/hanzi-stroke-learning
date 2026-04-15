---
name: hanzi-stroke-feature-delivery
description: >-
  Delivers new features or functional changes for hanzi-stroke-learning (Vite
  static app) using a fixed five-phase workflow: dual-perspective requirements
  analysis (architect + engineer), solution design, implementation todos, self-test,
  and full regression verification. Use when adding features, changing behavior,
  refactoring user-visible flows, or when the user asks for project-aligned
  delivery discipline.
---

# Hanzi Stroke Learning — 功能交付流程

本 skill 约束：**凡涉及新增功能或改动功能**（含行为、交互、数据流、可观测性），须按下列五阶段顺序执行；未完成前一阶段不得默认进入下一阶段（紧急热修可压缩文案，但仍须补全各阶段要点）。

## 阶段 1：需求分析（双角色）

以 **高级架构师** 与 **一线开发工程师** 两种视角分别产出，并合并为一份「需求分析」小节（可同一段落内分小标题）。

| 视角 | 关注点（须覆盖） |
|------|-------------------|
| 架构师 | 目标用户与场景、边界与非目标、与现有模块关系、风险与约束（性能、兼容、可维护、安全与隐私若适用） |
| 一线工程师 | 接口与数据、状态与错误路径、与现有代码的接入点、估算复杂度与依赖 |

**输出须包含**：问题陈述、验收标准（可测试）、明确不在范围内项。

## 阶段 2：方案设计

在阶段 1 验收标准成立的前提下，给出 **方案设计**：

- 推荐方案与备选方案（若仅一种，说明为何不必选其他）
- 模块/文件级改动范围（指向本仓库路径或目录习惯）
- 关键决策与权衡（一两句话即可，避免空泛）

## 阶段 3：实现计划（Todo）

将落地步骤拆为 **可勾选的任务列表**（使用 `TodoWrite` 或与用户约定的 checkbox 列表），每项应小到可在一个会话内完成或验证。至少包含：

- [ ] 实现核心逻辑与 UI（若涉及）
- [ ] 补充或更新测试（若本改动适用 Vitest）
- [ ] 运行 `npm run lint` / `npm test` / `npm run build` 中与本改动相关的子集

实现过程中仅改与需求相关的代码，避免顺带大范围重构。

## 阶段 4：功能自测验证

针对 **本功能/本改动** 的自测清单（手测步骤或命令），须全部通过后再进入阶段 5：

- 列出具体操作路径或执行的命令
- 记录预期结果；若失败，回到阶段 2 或 3 修正后再测

## 阶段 5：全功能验证

在自测通过后，对 **整站/全功能回归** 做最小必要验证，避免回归：

- 启动或构建：`npm run dev` 或 `npm run build`（按改动影响选择）
- 自动化：`npm run lint`、`npm test`（全量或通过理由）
- 手测：与本次改动可能波及的其它页面或流程（列 2～5 条即可，勿冗长）

**完成标准**：阶段 4、5 的清单均已勾选或等价确认，并简要说明结果。

## 回复结构模板

向用户汇报时，建议按以下顺序组织（可精简，但五阶段信息不可缺）：

```markdown
## 1. 需求分析（架构师 / 工程师）
...

## 2. 方案设计
...

## 3. 实现计划（Todo）
- [ ] ...

## 4. 功能自测
- [ ] ...

## 5. 全功能验证
- [ ] ...
```

## 与本项目栈的对应关系

- 构建与预览：`vite` / `npm run build` / `npm run preview`
- 测试：`vitest`（`npm test`）
- 代码风格：`eslint`、`prettier`

全功能验证时应优先跑通上述脚本中与本次改动相关的部分。
