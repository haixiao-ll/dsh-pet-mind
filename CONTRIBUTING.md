# 贡献指南

感谢你愿意改进这个项目。它是 **MIT 许可的 fork**，你的贡献也会以 MIT 发布。

## 开发环境

```sh
npm install
npm run typecheck   # tsc --noEmit
npm test            # node:test，直接跑 src/**/*.test.ts
npm run build       # tsdown → lib/（构建产物，不入库）
node lib/standalone.js --check
```

- Node ≥ 22.12；
- Windows 是主要目标平台（桌面感知/OCR 只在 Windows 生效，其它平台应优雅降级）；
- 不要求安装 Electron：`npm run build` 不会下载它，桌面模式首次运行才按需下载。

## 代码约定

1. **注释写"为什么"**，用中文；不要逐行翻译代码。
2. `src/host/mind/` 是分层模块：纯逻辑（可单测）与 I/O（Electron/HTTP）分开；
   新能力优先做成纯函数 + 注入依赖，再在 `index.ts` 装配。
3. 严格模式：`noUnusedLocals` / `noUnusedParameters` 全开，不要用 `any` 绕过（确有需要写 `unknown` + 收窄）。
4. **不要手改 `lib/`**：它由 `src/` 构建；`runtime/electron-helper/*.js` 是手写运行时，可以直接改，但要过 `node --check`。
5. 源码保持 UTF-8 且**不要写入裸控制字符**；PowerShell 脚本保持 ASCII（Windows PowerShell 5.1 无 BOM 时按 ANSI 解析）。

## 隐私红线（涉及感知/记忆/网络时必读）

- 新增采集必须经过 `src/host/mind/privacy.ts`；**默认拒绝**，敏感应用不采；
- 不把窗口标题、截图、OCR 文本写进日志或记忆（日志最多记长度/状态）；
- 任何出网数据默认关闭，且需要用户显式配置（如 `analyze.endpoint` + `allowlist`）；
- 落盘文件只能放在 `$DSH_HOME/dsh-pet/` 下，并在 `docs/PRIVACY.md` 登记；
- PR 描述里不要粘贴真实屏幕截图、令牌或个人信息。

## 测试与自检

提交前至少跑：

```sh
npm run typecheck && npm test && npm run build && node tools/verify-package.mjs
```

- 纯逻辑改动必须有单测；修复 bug 优先补一条会失败的测试；
- 涉及 `mind` 配置字段时，同步 `assets/config.jsonc`（带中文注释）与 `docs/MIND.md`；
- 涉及"做不到什么"的改动，更新 `docs/LIMITATIONS.md`。

## 素材政策

**不要提交来源不明的图片、字体、表情包。** 本项目现有素材来自上游，其权利状态见
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。新增动画/表情包请使用你有权分发的素材，
并在 PR 里说明来源与授权。

## 提交与 PR

- 一个 PR 做一件事；标题用 `feat:` / `fix:` / `docs:` / `chore:` 前缀；
- PR 模板里的 checklist 请如实勾选；
- 破坏性改动（配置字段、路由、存储格式）要在 PR 里写明迁移方式。

## 行为准则

参与本项目即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
