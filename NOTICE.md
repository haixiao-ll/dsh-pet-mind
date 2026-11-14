# NOTICE —— 来源、许可与本仓库的改动范围

## 1. 这个仓库是什么

一只住在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里的桌宠插件，
同时是本项目作者对 `dsh-pet` 的增强 fork。它不是从零写的，而是**一条 fork 链上的第三段**：

```
PC2005-cloud/dsh-pet  v0.3.8   （MIT，原作者：桌宠本体、动画流水线、桌面 Electron 外壳）
        │  TuWeiZhi/dsh-pet 0.4.4（MIT，增强 fork：碎碎念本地化、气泡收起、夹框、边距…）
        ▼
dsh-pet-mind          0.5.0    （MIT，本仓库：构建链 + 心智层 + 发布文件）
```

- 上游作者与版权：`Copyright (c) 2025-2026 PC2005-cloud`
- 增强 fork 作者与版权：`Copyright (c) 2026 TuWeiZhi`
- 本仓库追加的改动：`Copyright (c) 2026 dsh-pet-mind contributors`
- 完整许可见 [`LICENSE`](LICENSE)（MIT；三段版权行并列，**没有删改上游声明**）

> 上游 `LICENSE` 写 `2026`、`NOTICE` 写 `2025`，两处不一致；本仓库按年份区间合并为 `2025-2026`，
> 不改变任何一方的权利。

**非官方声明**：本项目与 DeepSeek / DeepSeek Harness 官方无隶属、合作或背书关系；
相关名称与商标归其权利人所有。

## 2. 本仓库做了什么

### 2.1 恢复构建链（工程性改动）

0.4.4 发布的是**构建产物快照**：`lib/*.js` 与 `runtime/electron-helper/shared-core.js` 被直接改过，
仓库没有构建链，`src/` 只是上游原文。0.5 起补回：

| 文件 | 0.4.x | 0.5.x |
|---|---|---|
| `src/**` | 上游原文，改了不生效 | **唯一事实来源**，`npm run build` 编出 `lib/` |
| `lib/*.js` | 提交进仓库的产物 | 构建产物，`.gitignore` 忽略 |
| `shared-core.js` | 手改产物 | 由 `src/shared` 构建 |
| `runtime/electron-helper/*.js`（其余） | 手写 JS | 仍是手写 JS，随包发布 |

### 2.2 回植原 fork 的增强（行为保持一致）

碎碎念本地语句池、气泡点一下收起、停留/文字倍率、动作留白、拖拽夹框、贴角边距只算角色本体、
配置读取容错与备份、Electron 下载多镜像。`patches/` 保留为历史对照，不再是构建输入。

### 2.3 新增心智层（0.5.0）

- **上下文用量**：`session/event` 的 `usage` + `contextWindow`；宠物头顶进度环 + 80%/95% 提醒；
- **双轨记忆**：工作记忆（会话摘要）+ 陪伴记忆（称呼/偏好/约定）+ 索引，注入系统提示词供新会话续接；
- **专注建议**：进入新页面 30 秒 → Windows 本地 OCR → 文字 + 应用名交给**用户配置的文本模型**
  → 一句话建议；每页一次、每天 6 条、失败重试一次；提示词硬性约束"只做建议，不做实际操作"；
- **隐私闸门**：敏感应用名单 + 标题兜底 + 识别不出即拒绝 + 暂停开关；出厂默认 OCR 只截单帧、图像不出本机；
- **待机**：空闲 ≥5 分钟且屏幕未变化 → 只播待机、碎碎念静音；
- 建议文案上限 120 字，提示词跟随 `maxChars`；默认开启 OCR 建议，安装即用；
- 开发期修复（未单独发版）已合并：事件 `data` 层级、窗口缺失兜底、环位置/悬停/自动显示、
  冷启动快照。

细节见 [`docs/MIND.md`](docs/MIND.md)，能力边界见 [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md)，
数据流见 [`docs/PRIVACY.md`](docs/PRIVACY.md)。

## 3. 素材的版权不在 MIT 范围内

`assets/webm`（动画）、`assets/memes`（表情包）、`assets/fonts`（字体）、`assets/logo.png`
来自上游，**不是本仓库原创**。代码 MIT ≠ 素材可以随便商用。逐项声明与发布建议见
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。

## 4. 与上游同步

```sh
git remote add upstream https://github.com/TuWeiZhi/dsh-pet.git
git fetch upstream
git diff upstream/main -- src/   # 先看差异，再决定合并
```

心智层是新增目录（`src/host/mind/**`）与新增配置段（`mind`），与上游冲突概率低；
回植的增强落在既有文件里，冲突时按 `docs/ARCHITECTURE.md` 的模块边界处理。

## 5. 反馈

- 本仓库的问题：提到你自己的 issues（地址在 `package.json` 的 `repository`）。
- 桌宠/动画/上游功能本身的问题：请到上游
  [`PC2005-cloud/dsh-pet`](https://github.com/PC2005-cloud/dsh-pet) 反馈。
