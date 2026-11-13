# NOTICE —— 来源、许可与本仓库的改动范围

## 1. 这个仓库是什么

一只住在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里的桌宠插件。
它不是从零写的，而是**一条 fork 链上的第三段**：

```
PC2005-cloud/dsh-pet  v0.3.8   （MIT，原作者）
        │  增强 fork：碎碎念本地化、气泡可收起、动作留白、夹框、边距只算角色本体
        ▼
TuWeiZhi/dsh-pet      0.4.4    （MIT，构建产物级 patch）
        │  本仓库：把 patch 回植到 TypeScript、恢复构建链、新增 mind 心智层
        ▼
dsh-pet-mind          0.5.0    （MIT，本仓库）
```

- 上游作者与版权：`Copyright (c) 2025-2026 PC2005-cloud`
- fork 作者与版权：`Copyright (c) 2026 TuWeiZhi`
- 本仓库追加的改动：`Copyright (c) 2026 dsh-pet-mind contributors`
- 完整许可见 [`LICENSE`](LICENSE)（MIT，三段版权行并列，**没有删改上游声明**）

> 说明：上游 `LICENSE` 写的是 `2026`、`NOTICE` 写的是 `2025`，两处不一致。
> 本仓库按"年份区间"合并成 `2025-2026`，不改变任何一方的权利。

## 2. 本仓库（0.5）做了什么

### 2.1 恢复构建链（工程性改动）

0.4.4 发布的是**构建产物快照**：`lib/*.js` 与 `runtime/electron-helper/shared-core.js`
被直接改过，仓库里没有构建链，`src/` 只是上游原文。这导致任何新功能都只能继续手改打包结果。

0.5 把这条链补了回来：

| 文件 | 0.5 之前 | 0.5 之后 |
|---|---|---|
| `src/**` | 上游原文，改了不生效 | **唯一事实来源**，`npm run build` 编出 `lib/` |
| `lib/*.js` | 提交进仓库的产物 | 构建产物，`.gitignore` 忽略 |
| `runtime/electron-helper/shared-core.js` | 手改的产物 | 由 `src/shared` 构建（`window.PetShared`） |
| `runtime/electron-helper/*.js`（其余） | 手写 JS | 仍是手写 JS（不经 TS 编译，随包发布） |

### 2.2 回植原 fork 的增强（行为保持一致）

TuWeiZhi 的 9 个 patch（`patches/02`–`13`）只打在产物上。0.5 逐条回植到 TypeScript：

- 碎碎念改为**本地语句池**（零网络、零 token、零延迟），`POST /whisper?text=` 支持试播；
- 气泡**点一下收起**、停留秒数 `whisperBubbleSec`（0 = 不消失）、文字倍率 `whisperTextScale`；
- 随机动作之间可留白 `eventsRefreshSec.action`；
- 拖拽/甩抛/落点全部夹在视口内（`clampPetBox`），贴角边距只算角色本体（`sideAllow`）；
- 配置读取容忍 UTF-16、落盘前自动备份、Electron 下载多镜像重试。

`patches/` 目录保留为**历史对照**（它们描述的是 0.4.4 的产物差异），不再是构建输入。

### 2.3 新增 mind 心智层

- 上下文用量计量（`session/event` → 百分比 → 阈值提醒 → 自动落摘要）；
- 双轨记忆：工作记忆 `memory/work/*.md` + 陪伴记忆 `memory/companion/*.md` + `INDEX.md`，
  并通过 `ctx.systemPrompt.section()` 注入系统提示词（新会话/子支线可续接）；
- 桌面感知：Windows 前台应用 + 空闲时长（常驻 PowerShell，只读、不落盘）；
- 隐私闸门：敏感应用名单 + 标题兜底 + 默认拒绝；
- 主动建议：停留 3 分钟建议一次、冷却、每日上限、夜间免打扰、人不在转待机。

细节见 [`docs/MIND.md`](docs/MIND.md)，架构见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 3. 素材的版权不在 MIT 范围内

`assets/webm`（97 个透明动画）、`assets/memes`（表情包）、`assets/fonts`（字体）、
`assets/logo.png` 来自上游，**不是本仓库原创**。代码 MIT ≠ 素材可以随便商用。
逐项声明见 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。

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
- 宠物/动画/上游功能本身的问题：请到上游
  [`PC2005-cloud/dsh-pet`](https://github.com/PC2005-cloud/dsh-pet) 反馈。
