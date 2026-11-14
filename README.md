# dsh-pet-mind 🐾 桌宠 + 心智层（0.5.4）

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-orange">
  <img alt="fork of" src="https://img.shields.io/badge/fork%20of-TuWeiZhi%2Fdsh--pet%200.4.4-informational">
  <img alt="upstream" src="https://img.shields.io/badge/upstream-PC2005--cloud%2Fdsh--pet%20v0.3.8-blueviolet">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20DeepSeek%20Harness-8A2BE2">
</p>

> **非官方插件**：与 DeepSeek、DeepSeek Harness 官方无隶属关系；"DeepSeek" 等名称归其权利人所有。
>
> **来源链**：`PC2005-cloud/dsh-pet` v0.3.8（MIT）→ `TuWeiZhi/dsh-pet` 0.4.4（MIT）→ 本仓库（MIT）。
> 代码许可见 [LICENSE](LICENSE)，改动与来源见 [NOTICE.md](NOTICE.md)，
> 素材与第三方组件见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
>
> **一句话**：一只住在 DeepSeek Harness 里的桌宠，外加一层"知道你上下文还剩多少、记得你们做过什么、
> 能在你停留时给一句基于屏幕文字的建议"的心智层——**不录屏、不执行操作、不替你做事**。

---

## 这个项目做了什么（相对上游）

上游 `dsh-pet` 是一个纯桌宠：动画、拖拽、桌面透明窗、余额、聊天。本仓库在它之上做了两类改动：

### 1）工程：恢复真正的构建链

原 fork 发布的是**构建产物快照**（`lib/*.js` 被直接改过，没有构建链，改 `src/` 不生效）。
本仓库把原 fork 的 9 个产物级补丁**回植到 TypeScript 源码**，并恢复 `tsdown` 构建：

- `npm run build`：`src/client` / `src/host` / `src/standalone` → `lib/*.js`，`src/shared` → 桌面 `shared-core.js`；
- `npm test`：`node:test` + 原生类型擦除，1000+ 单测；
- `npm run typecheck` / ESLint / CI / 发版自检（`tools/verify-package.mjs`）。

### 2）心智层（mind，0.5 新增）

| 能力 | 它做什么 | 边界 |
|---|---|---|
| **上下文用量** | 从 DSH 的 `session/event` 读 `usage` 与 `contextWindow`，算子代理不算 | 只覆盖 DSH 会话；窗口未知时不显示 |
| **工作记忆** | 到阈值把最近对话抽成 Markdown（本地抽取，零 token），写进 `memory/work/` | 抽取式，不是"完全理解"；可能漏要点 |
| **陪伴记忆** | 只记称呼/偏好/约定，写进 `memory/companion/` | 启发式触发，可能误记/漏记 |
| **记忆注入** | 把 `INDEX.md` 注入系统提示词，新会话/子支线能续上 | 有长度上限；会占用一点上下文 |
| **专注建议** | 进入新页面 30 秒 → 本地 OCR → 文字交给**你的文本模型** → 一句话建议 | 每页只一次、每天 6 条、失败重试一次；**只建议，不操作** |
| **待机** | 人不在（空闲 ≥5 分钟且屏幕未变化）→ 只播待机、碎碎念静音 | Windows 专用；误判可能发生 |
| **隐私闸门** | 微信/支付宝/网银/密码管理器/远程桌面 + 标题兜底 + 识别不出即拒绝 | 不是万无一失，见 [PRIVACY](docs/PRIVACY.md) |

## 做不到什么（先看这里）

- **不能真正"读懂"你在干什么。** OCR 只把屏幕上的**文字**读出来；它不理解图片、图表、视频、
  软件界面结构，也不知道你的意图。建议来自"这段文字 + 应用名"，模型可能理解偏、甚至编造。
- **不能"看着你"做出判断。** 默认不截屏；即使开启 OCR 模式，也只在停留到期时截**一帧**（内存），
  立即转文字后丢弃。没有持续画面、没有视觉理解。
- **不能执行任何操作。** 不点鼠标、不敲键盘、不调工具、不改文件；提示词里明确要求"只做建议"。
- **不能识别密码框。** 外部程序无法可靠判断别的应用里是否在输入密码；只能靠应用名单 + 窗口标题 +
  手动暂停（"隐私暂停"）。提权窗口读不到标题 → 直接不采。
- **不是监控软件。** 不做录屏、不留副本、不做人脸/身份识别、不上传画面；不适合用于员工监控、
  取证或任何需要留证的场景。
- **记忆不等于理解。** 摘要是抽取式的，可能丢掉关键结论；注入的记忆也可能与新情况冲突。
- **平台限制**：桌面感知与 OCR 仅 Windows；多屏只截光标所在那块屏；OCR 依赖系统语言包，
  排版复杂/字体过小/深色背景下可能读不出字。

完整清单见 [docs/LIMITATIONS.md](docs/LIMITATIONS.md)。

## 安装

**没有发布到 npm**。用本地 tgz（[Releases](../../releases) 或 `npm pack` 产物）：

```bat
:: 1) 旧插件与本插件共用 entry id dsh-pet，先卸旧的
"...\dsh.cmd" plugin --profile desktop remove @tuweizhi/dsh-pet

:: 2) 装本包
"...\dsh.cmd" plugin --profile desktop add "路径\dsh-pet-mind-0.5.1.tgz"

:: 3) 完全退出 DSH 再启动（不要在运行中热装后指望立即生效）
```

`dsh web` 用户把 `--profile desktop` 换成 `--profile web`，然后重启 `dsh web`。
详细步骤、配置片段、排查与回滚见 [docs/INSTALL-LOCAL.md](docs/INSTALL-LOCAL.md)。

**独立模式**（不打开 DSH，仅桌宠）：

```sh
npm install && npm run build
node lib/standalone.js --check
node lib/standalone.js
```

## 配置（`mind` 段）

用户配置在 `$DSH_HOME/dsh-pet/main-config.jsonc`（Windows：`%USERPROFILE%\.dsh\dsh-pet\`）：

```jsonc
"mind": {
  "enabled": true,
  "coach": {
    "enabled": true,
    "dwellSec": 30,            // 进入新页面多久后建议一次
    "dailyLimit": 6,           // 全局每天最多几条（只计真正弹出的）
    "maxAttemptsPerStay": 2,   // 失败重试一次
    "idleMinutes": 5,          // 空闲多久算"人不在"
    "quietHours": [23, 8]      // 免打扰
  },
  "suggestion": {
    "model": { "provider": "", "model": "" },  // 留空 = 与「对话」同一模型
    "maxChars": 120
  },
  "vision": {
    "enabled": false,          // 默认关闭；开启后才有截帧/OCR
    "mode": "ocr"              // ocr=本地 OCR；local=只算哈希；model=云端视觉（可选，默认关）
  }
}
```

全部字段带中文注释的出厂默认见 [`assets/config.jsonc`](assets/config.jsonc)。

## 隐私与数据流（摘要）

| 数据 | 在哪 | 是否离开本机 |
|---|---|---|
| 屏幕帧（仅在 `vision.enabled` 时） | Helper 内存 → 本地 OCR → 丢弃 | **不离开**（`mode:"ocr"`） |
| OCR 文字 + 前台应用名 | 内存 → 交给**你配置的**文本模型 | **会**，只发给你选的服务商 |
| 窗口标题 | 内存，仅用于隐私判定 | 不落盘、不发网络 |
| 记忆 `memory/*.md` | `$DSH_HOME/dsh-pet/memory/` | 不离开，除非你把它提交/同步 |
| 配置 | `main-config.jsonc` | 不离开 |

控制手段：`mind.enabled=false` 整层关闭；`vision.enabled=false` 不碰像素；
设置页「隐私暂停」或 `mind.privacy.paused=true` 立即停采；删除 `memory/` 即清空记忆。
完整说明（含法律依据与保留期）见 [docs/PRIVACY.md](docs/PRIVACY.md)。

## 法律与合规（要点）

- **代码**：MIT。允许修改、发布、商用，但必须保留版权与许可声明、注明改动、不得用原作者名义背书。
- **素材**：`assets/webm`、`assets/memes`、`assets/fonts`、`assets/logo.png` 来自上游，**不因代码 MIT 而自动可商用**。
  表情包多为网络梗图、字体有独立授权——**公开分发前请自行确认或替换**。
- **名称**：本项目是非官方 fork，未使用 DeepSeek 官方标识暗示背书；"DeepSeek Harness" 名称归其权利人。
- **个人信息**：OCR 文字属于可能含个人信息的屏幕内容。请仅在**你有权处理的设备与内容**上使用；
  在工作场所或他人设备上使用，需遵守当地劳动法/个人信息保护法（如中国《个人信息保护法》的告知同意、
  最小必要原则），并取得相关人员同意。**本项目不构成法律意见。**
- **模型服务**：文字会发给你配置的模型服务商，适用其服务条款与数据政策；请勿把涉密/受限材料送入云端模型。

完整说明见 [docs/LEGAL.md](docs/LEGAL.md)。

## 文档

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：目录、构建、**与 DSH 的连接点**、IntelliJ 打开与调试、扩展指南
- [docs/MIND.md](docs/MIND.md)：心智层设计、OCR 链路、策略与隐私
- [docs/PRIVACY.md](docs/PRIVACY.md)：数据清单、出网边界、保留期、法律依据、用户控制
- [docs/LIMITATIONS.md](docs/LIMITATIONS.md)：做不到什么（能力边界）
- [docs/LEGAL.md](docs/LEGAL.md)：许可、素材、商标、个人信息与免责
- [docs/INSTALL-LOCAL.md](docs/INSTALL-LOCAL.md)：本地安装、配置、排查、回滚
- [docs/PUBLISH.md](docs/PUBLISH.md)：改名、GitHub/Gitee、npm、发布前 checklist
- [CHANGELOG.md](CHANGELOG.md)：逐版本改动

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
node tools/verify-package.mjs
```

贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题见 [SECURITY.md](SECURITY.md)。

## 来源与致谢

- 上游：`PC2005-cloud/dsh-pet`（桌宠本体、动画流水线、桌面 Electron 外壳）
- 增强 fork：`TuWeiZhi/dsh-pet`（碎碎念本地化、气泡可收起、夹框、边距等）
- 灵感：`dsh-vision-router`（"把画面转成文本再交给纯文本模型"的思路；本仓库**未**把它作为依赖打包）

## 许可

[MIT](LICENSE)。素材版权独立于代码，详见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
