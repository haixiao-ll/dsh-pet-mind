# 变更说明

<!-- 一句话说清这个 PR 做了什么；关联的 issue 用 "Closes #123" -->

## 改了什么

- [ ] 桌宠本体（`src/client/**`、`src/shared/**`）
- [ ] 宿主/路由（`src/host/**`）
- [ ] 心智层（`src/host/mind/**`）
- [ ] 桌面 Helper（`runtime/electron-helper/**`）
- [ ] 构建/CI/发布（`scripts/**`、`.github/**`、`package.json`）
- [ ] 文档（`README.md`、`docs/**`）

## 验证（必须全绿）

```sh
npm run typecheck
npm test
npm run build
node tools/verify-package.mjs
```

- [ ] 以上四条都跑过并通过
- [ ] 新增/修改的行为有对应单测（纯逻辑优先）
- [ ] 如果改了 `mind` 配置字段，`assets/config.jsonc` 与 `docs/MIND.md` 同步更新

## 隐私检查（涉及感知/记忆/网络时必填）

- [ ] 新增的采集都过了 `src/host/mind/privacy.ts`
- [ ] 不会把窗口标题/截图/密钥写进日志或记忆
- [ ] 出本机的数据默认关闭，且需要 `cloudAllowlist` 显式开启
- [ ] 落盘文件都在 `$DSH_HOME/dsh-pet/` 下

## 兼容性

- [ ] 已有用户的配置/记忆目录不需要迁移（或已提供迁移）
- [ ] `cordis.patch.yml` 的 entry id / `package.json` 的 name / 客户端模块 id 三者仍然一致（`verify-package.mjs` 会查）

## 备注

<!-- 截图、设计取舍、后续 TODO -->
