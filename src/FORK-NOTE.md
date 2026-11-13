# src/ 说明：这里是**唯一事实来源**

## 一句话

`src/` 是 TypeScript 源码，`npm run build` 会把它编成运行时产物：

```
src/host/index.ts        → lib/index.js        宿主半侧（Cordis 插件）
src/client/index.ts      → lib/client.js       浏览器半侧（overlay + 设置页）
src/standalone/cli.ts    → lib/standalone.js   独立模式 CLI
src/shared/index.ts      → runtime/electron-helper/shared-core.js（window.PetShared）
```

**改 `src/` 之后必须重新构建**，否则跑的还是旧的 `lib/`：

```sh
npm run bundle            # 只编三个入口（最快）
npm run build             # 三个入口 + 桌面 shared-core + 类型声明（发布用）
```

## 与 0.4.x 的区别

0.4.x 是"发布快照"：只有 `lib/*.js` 产物，`src/` 只是上游原文的对照，
改它不会生效（当时的说明就是这么写的）。0.5 恢复了构建链，
原 fork 的 9 个产物级补丁已经**回植到本目录的 TypeScript 源码**：

| 改动 | 现在的源码位置 |
|---|---|
| 碎碎念本地语句池 / `POST /whisper?text=` | `src/host/index.ts`、`src/host/memes.ts`、`src/host/whisper-policy.ts` |
| 配置校验与全局默认（whisperLines / whisperBubbleSec / whisperTextScale / action） | `src/host/config.ts` |
| 气泡可收起 / 停留 / 倍率 / 夹框 / 设置页 | `src/client/bubble.ts`、`src/client/pet.ts`、`src/client/settings.ts` |
| 贴角只算角色本体（sideAllow） | `src/shared/motion.ts`、`src/shared/fonts.ts` |
| 桌面端读碎碎念偏好 | `src/shared/whisper.ts` + `runtime/electron-helper/*.js` |

`patches/` 目录保留为**历史对照**（它们描述的是 0.4.4 的产物差异），不再是构建输入。

## 心智层

`src/host/mind/**` 是 0.5 新增的独立模块，架构与数据流见
[`../docs/MIND.md`](../docs/MIND.md)，构建与 DSH 连接见
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)。
