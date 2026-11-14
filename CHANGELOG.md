# Changelog

本 fork 从上游 [`PC2005-cloud/dsh-pet`](https://github.com/PC2005-cloud/dsh-pet) **v0.3.8** 起算，版本号按本仓库自己的节奏走（首个版本 `0.4.0`）。上游的版本历史见上游仓库。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

---

## [0.5.7] —— 环"有数据却看不见"：自动亮 10 秒 + 位置改 JS 像素

两个原因叠在一起：

1. 0.5.4 起环默认 `opacity:0`、靠悬停显示；桌面透明窗里指针**不动**时不一定有 mousemove/pointerenter，
   数据到了环也不会亮；
2. `left` 用了 `calc(50% + var(--size) * 0.1875 + 4px)`——CSS calc 里的乘法在部分 Chromium 无效，
   整条 `left` 被丢弃，环跑到舞台左上角，看起来就像"没有"。

修复：

- 位置改为 JS 按 `size` 计算像素（`size × 0.6875 + 4`），浏览器/桌面一致；
- **数据变化（含启动恢复）自动显示 10 秒**，悬停可继续显示，移开/超时淡出；
- 保留指针/鼠标事件悬停（0.5.5）与 stale 灰度标记（0.5.6）。

---

## [0.5.6] —— 冷启动不再空窗：恢复上一轮上下文快照

一句话：**重启后上下文计量只吃实时事件、不回放历史，必须等一轮回复才有数字**——
所以"第一次加载没环、互动后才有"。现在把上一轮快照落盘，启动时先恢复（标 stale），
本轮 usage 一到立刻替换。

- 新增 `$DSH_HOME/dsh-pet/mind-state.json`：只存 **token 数/窗口/模型名**，不含屏幕内容；
- 启动读取 24 小时内的快照，环先显示（灰度 + 悬停文案带「上次记录，等待本轮数据」）；
- 收到本轮 `assistant/message` 后清除 stale；
- 配合 0.5.5 的指针事件悬停、3 秒轮询与启动预热，环出现更跟手。

---

## [0.5.5] —— 悬停显隐改用指针/鼠标事件（透明窗里 CSS :hover 不可靠）

- 0.5.4 把环改成默认隐藏 + CSS `:hover` 显示，结果在桌面透明窗里基本不出现；
- 浏览器：`onPointerEnter/Leave` 直接切 `is-hover` 类；
- 桌面：`pointerenter/leave` + **全局 `mousemove` 命中区兜底**（窗口 forward 模式下 pointerenter 不保证触发）；
- `/mind/state` 轮询 10s → **3s**；启动时**预热** `contextWindow`（resolveModel），
  第一轮 usage 一到就能立刻算出百分比；
- 仍然：窗口未知时不画环（宁可不显示，也不显示错的百分比）。

---

## [0.5.4] —— 进度环：改成悬停显示，位置移到右肩外侧（避开气泡）

- 之前环常驻且放在舞台角落：离角色远，也不会消失；
- 现在**鼠标悬停宠物才出现，移开淡出**（浏览器与桌面端同一套 `:hover` 规则）；
- 位置改为**角色右肩外侧**：水平贴身体右缘（HIT_BOX 240/640 → 中线 +18.75%），
  垂直 28%。气泡底边固定在舞台顶下方 `size×0.108`（≈19.2%）+ 尾巴（≈4%），
  所以 28% 落在气泡覆盖带以下，不会再被气泡盖住；
- 环 `pointer-events:none`，不抢拖拽/点击。

---

## [0.5.3] —— 修复：重启后拿不到 `contextWindow`，头顶环不显示

一句话：**0.5.2 能算出已用 token，但拿不到模型窗口**——DSH 只在"路由/容量变化"时才发
`request/context`，重启后路由没变就一直等不到，于是 `percent` 永远缺省、环不出现。

修复：

- `ContextMeter.setWindow()`：允许先有 usage、后补窗口；
- `Mind` 在拿到 `assistant/message` 但窗口未知时，用宿主 `llm.resolveModel(provider, model)`
  解析 `contextWindow`（结果按 路由/模型 缓存）；
- 新增配置兜底 `mind.context.windowTokens`（0 = 自动；自动失败时可手填，例如 1048576）；
- 新增 1 条单测；真实会话回放仍为 `683,345 / 1,048,576 = 65.2%`。

---

## [0.5.2] —— 修复：DSH 事件载荷在 `data` 里，上下文与工作记忆之前一直为空

一句话：**0.5.0/0.5.1 读错了事件层级**——`session/event` 的形状是 `{ type, seq, time, data }`，
而代码读的是顶层 `usage` / `message`，于是：

- 上下文用量永远是 `null`（头顶环不出现、80%/95% 不提醒）；
- 对话缓冲一直为空（`POST /mind/summarize` 回 `no-session`，工作记忆写不出来）。

修复：

- `ContextMeter` 从 `event.data.usage` / `event.data.contextWindow` 取值（兼容旧的扁平形状）；
- `textOf` 从 `event.data.message.content`（assistant）与 `event.data.content`（user）取文本；
- 用真实会话日志回放验证：473 条事件 → `683,345 / 1,048,576 = 65.2%`（deepseek-flash）；
- 新增 3 条事件形状测试（data 包装、旧形状、非 text 块忽略）。

其余行为不变（0.5.1 的 maxChars 120 仍在）。

---

## [0.5.1] —— 建议文案上限可到 120 字，提示词跟随 maxChars

- `mind.suggestion.maxChars` 默认从 40 调到 120（合法范围仍是 20–120）；
- 提示词里写死的“不超过 40 字”改为跟随 `maxChars`——之前即使配置 120，模型仍只写 40 字左右；
- 其余行为不变（一次停留一次、失败重试一次、每天 6 条、OCR 本地）。

### 发布文件与合规（0.5.1 一并整理）

- `README.md` 重写为发布版：做了什么 / 新功能 / **做不到什么** / 安装 / 隐私摘要 / 法律要点；
- 新增 `docs/LIMITATIONS.md`（能力边界：不能真正读懂你在干什么、不能执行操作、不能识别密码框等）、
  `docs/PRIVACY.md`（数据清单/出网边界/保留期/用户控制/合规提示）、
  `docs/LEGAL.md`（MIT 义务、素材、商标、个人信息、免责）；
- 新增 `SECURITY.md`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`，并纳入发布 `files` 白名单；
- `NOTICE.md` / `THIRD-PARTY-NOTICES.md` 同步 0.5.1 的改动与素材风险；
- `docs/INSTALL-LOCAL.md` 更新到 0.5.1，并强调"装完必须完全退出重启"。

---

## [0.5.0] —— 恢复构建链 + 新增心智层（上下文 / 记忆 / 桌面感知）

一句话：**这个版本不再"改打包产物"，而是把上游的 TypeScript 源码重新变成唯一事实来源；桌宠也从"会动的贴纸"变成知道上下文、记得住事、该安静时会安静。**

### 工程 · 恢复 TypeScript 构建链

- 从上游 v0.3.8 取回 `tsdown` 构建链：`npm run bundle` 把 `src/client`、`src/host`、`src/standalone`
  分别编成 `lib/client.js`、`lib/index.js`、`lib/standalone.js`；
  `npm run build:desktop-core` 把 `src/shared` 编成 `runtime/electron-helper/shared-core.js`（`window.PetShared`）。
- `lib/` 与 `shared-core.js` 改为**构建产物**（`.gitignore` 忽略）；`src/` 成为唯一事实来源。
- 补齐 `tsconfig` / `eslint` / `node:test`（原生类型擦除，无需 ts-node）与 CI（类型检查 → 单测 → 构建 → 自检 → 打包演练）。
- 修掉两处只在"有构建链"时才会暴露的类型错误（`helper-process.ts` 的 mirrors 联合类型；
  Node strip-only 不支持的构造函数参数属性）。

### 工程 · 回植 0.4.x 的产物级增强（行为保持一致）

- 碎碎念本地语句池：`whisperLines` 校验与落盘、内置 40 句保底、`POST /whisper?text=` 试播、
  按概率配图（`WHISPER_IMAGE_CHANCE`）；
- 自动行为间隔 `eventsRefreshSec.action`（唯一允许 0 的键）、气泡停留 `whisperBubbleSec`、
  文字倍率 `whisperTextScale`（3 个新全局默认字段）；
- 客户端：气泡点一下收起、拖拽/甩抛/落点夹框、贴角边距只算角色本体、设置页两张新卡片；
- 桌面端：`anchorPixel` 的 `sideAllow` 补偿、气泡偏好（停留/倍率）真正生效。

### 新增 · mind 心智层（`src/host/mind/**`）

- **ContextMeter**：从 `session/event` 的 `assistant/message.usage` 与 `request/context.contextWindow`
  算上下文占比；排除子代理会话；`[80%, 95%]` 两档提醒（同档只报一次）。
- **双轨记忆**：工作记忆（会话摘要 → `memory/work/*.md`）+ 陪伴记忆（称呼/偏好/约定 →
  `memory/companion/*.md`）+ 自动索引 `INDEX.md`；本地抽取式摘要（零 token），
  原子写盘，写后清空缓冲区避免重复记。
- **记忆注入**：`memory/INDEX.md` 经 `ctx.systemPrompt.section()` 注入系统提示词
  （order 950，上限 1600 字符）——新会话与子支线因此能"快速学习"。
- **桌面感知**：常驻 PowerShell 采集前台进程/窗口标题/系统空闲（`GetLastInputInfo`），
  5 秒一次，只读、不落盘、不截图。
- **隐私闸门**：内置敏感应用名单（微信/支付宝/网银/密码管理器/远程桌面）+ 标题正则兜底 +
  识别不出即拒绝（fail-closed）；`cloudAllowlist` 留空 = 任何画面不出本机。
- **Coach**：停留 3 分钟建议一次、同一次停留只一次、同应用 30 分钟冷却、每日 8 条上限、
  23:00–08:00 免打扰；空闲 5 分钟视为"人不在"，不建议、不打扰。
- **内容建议（默认 OCR）**：停留满 `dwellSec`（默认 30 秒）截一帧 → **Windows 自带 OCR**（本地）
  → 文字 + 应用名交给文本模型写一句建议；画面不出本机，不需要多模态模型。
- **建议节奏**：一次停留（应用 + 窗口标题）只建议一次，切页面/应用才重新计时；全局每天 6 条；
  失败（OCR 无字/模型报错/SKIP）30 秒后重试一次，最多 2 次尝试，成功即封口。
- **提示词约束**：末尾硬性要求「只做出建议，不做任何实际操作」（不调用工具、不改文件、不执行命令）。
  `mode="model"`（直接把帧发云端视觉端点）仍保留，但默认关、需显式配置。
- **进度环**：浏览器 overlay 与桌面透明窗两端都有（`/mind/state` 10s 轮询 / `sections.mind` 叶子），
  绿 `<80%`、琥珀 `80–95%`、红 `≥95%`，悬停显示 token 数；窗口未知时不画。
- **待机**：人不在（空闲 ≥5 分钟且屏幕未变化、前台未切换）→ 随机链只播 idle、碎碎念静音；
  回来自动恢复。桌面端读同一条 `sections.mind`。
- **截帧（默认关闭）**：`mind.vision.enabled` 开启后 Helper 每 30s 截一张 640×360 缩略图，
  **内存里算完哈希就销毁**，只回传 `{hash,width,height}`；用于"屏幕还在变 = 人在"的判定，
  不落盘、不进附件库、不发网络。
- **设置页「心智层」卡片**：上下文用量 / 记忆条数 / 感知状态只读展示，
  「立即记一份」「暂停/恢复采集」两个动作（全部走 `/mind/*`，不参与「保存」整包写入）。
- **HTTP**：`/dsh-pet-7340/mind/{state,context,memory,summarize,pause,frame}`。
- **改名脚本**：`node scripts/rename-fork.mjs --name ... --repo ...` 一次改全
  package.json / 客户端模块 id / cordis name / 文档安装命令（带 `--dry-run`）。
- 配置：`assets/config.jsonc` 新增带完整中文注释的 `mind` 段。

### 新增 · 发布相关

- `LICENSE` 并列三段版权（上游两段 + 本仓库，未删改），`NOTICE.md` 重写来源链与改动范围；
- 新增 `THIRD-PARTY-NOTICES.md`（字体/表情包/动画的版权状态与发布前建议）；
- 新增 `docs/ARCHITECTURE.md`（目录、构建、**与 DSH 的连接点**、IntelliJ 打开与调试、扩展指南）、
  `docs/MIND.md`（心智层设计、隐私承诺与限制）、`docs/PUBLISH.md`（改名/GitHub/Gitee/npm）；
- `tools/verify-package.mjs` 重写：清单自洽、客户端模块 id 与包名一致、cordis 挂载行、默认配置可解析、
  本机路径/令牌泄漏扫描；
- CI 改为真构建；Release workflow 默认只产出 tgz（不自动发 npm）。

---

## [0.4.4] —— 修复：设置页的「碎碎念停留秒数」与「文字倍率」在桌面端完全没生效

一句话：**这两项在设置页里填了能存下来、浏览器端也认，但桌面端从头到尾没读过它们 —— 停留永远写死 10 秒、文字永远 1×。这一版让桌面端按配置走。**

### 修复 · 桌面端读不到「停留秒数」/「文字倍率」

- 配置链路断在 `renderer.js` 的 `loadConfig()`：它只把 `pets` / `physics` / `confineToScreen` / `font` 交出去，
  `whisperBubbleSec` 与 `whisperTextScale` 压根没进桌面端（`shared-core.js` 的 `flattenConfigPets` 也没带）。
  现在两个字段一路带到 `sprite` 的构造函数，经 `whisperDwellMsOf()` / `whisperTextScaleOf()` 归一化
  （非法/缺省回落 10s 与 1.35，与浏览器端同一口径）。
- 停留时长：`events.js` 的 `showWhisper` 原来写死 `duration ?? BUBBLE_DURATION_MS`。现在改成
  **显式 `duration`（`POST /broadcast` 指定）> 设置页「停留秒数」> 内置 10s 兜底**，且 `0` 是合法值 =
  「不自动消失」（只清旧定时器、不挂新的），与浏览器端 `if (dwellMs > 0)` 同语义。
- 文字倍率：`index.html` 的 `.pet-bubble.is-whisper` 把 `--f` 乘上 `--dsh-pet-whisper-scale`
  （`sprite.js` 注入），字号 / 内边距 / 圆角 / 宽度上限一起放大 —— 与浏览器端 `.dsh-pet-bubble.dsh-pet-whisper`
  改 `--f` 是同一套写法；变量缺省 1，所以没配过的时候与改造前完全一致。
- 配图不跟着放大（对齐设置页文案「只放大文字，配图尺寸不跟着变」）：`.pet-bubble.is-whisper .pet-bub-img { --m: var(--f0); }`。
- 窗口上边距按**放大后**的字号预留（`shared-core.js` 新增 `bubbleMaxHeightOfPx()` / `bubbleTopMarginOfPx()`，
  原 `bubbleMaxHeightPx` / `bubbleTopMarginPx` 改成一行转调、行为不变）：否则倍率调到 3× 时气泡顶端会被窗口上边缘切掉。

### 验证（本机 3440×1440 / Windows）

- 停留秒数填 4：气泡 1.2s 在、5.8s 已消失（改造前恒为 10s）。
- 停留秒数填 0：12s 后气泡仍在。
- 显式 `POST /broadcast` 带 `duration: 20000`：配置 3s 时仍活到 8s 以上 —— 优先级正确。
- 文字倍率 1.0 / 2.2 / 3.0 三档截图对比：文字逐档明显变大、配图尺寸不变、气泡未被窗口切边（窗口高度随字号自动加高）。

### 修复 · `patches/07`–`12` 的编码（`git apply` 报 `No valid patches in input`）

这六个 patch 曾被 PowerShell 的 `>` / `Out-File` 重定向写盘，落成了 **UTF-16LE + BOM + CRLF**，
`git apply` 会直接拒绝（`error: No valid patches in input (allow with "--allow-empty")`）。
现全部重写为 **UTF-8 无 BOM + LF**，与 `.gitattributes` 的 `* text=auto eol=lf` 一致。
重放验证：`git worktree add --detach <tmp> HEAD` 后依次应用 `07`–`13`，**全部 APPLIED**，
且产出的 10 个文件（`lib/index.js`、`lib/client.js`、`runtime/electron-helper/{shared-core,sprite,events,renderer}.js`、
`index.html`、`src/host/{config,helper-process,index}.ts`）与工作区 **SHA256 全部一致** —— 即 patch 精确等于
`0.4.1 → 0.4.4` 的全部差异；另把上游 0.3.8 tarball 解包后重放 `01`–`06` 也全部 APPLIED。
`patches/README.md` 已补上「用 `git diff --output=` 而不是 `>` 生成 patch」的告警。

---

## [0.4.3] —— 修复：设置页「让宠物说这句」在「仅桌面」下没反应；桌面端气泡支持点一下收起

一句话：**「让宠物说这句」把 surface 写死成 `web`，宠物显示位置是 `desktop` 时被宿主直接拒绝且报错写在页面另一头；桌面端气泡则根本不可点。这一版让两边都能用。**

### 修复 · 设置页「让宠物说这句」点了没反应

- 按钮请求的是 `POST /whisper?…&surface=web`，而宿主会按 `displayCovers('web', display)` 校验：`display="desktop"` 时返回
  `{ok:false, reason:"pet-not-displayed"}`，气泡自然永远不出现。现在改成 `surface=any`（web / desktop / both 都通过）；
  菜单里的碎碎念同理。
- 失败提示原来写到页面顶部的 `msg`（渲染在「宠物配置」卡片右上角），而语句池卡片在下面隔一屏 —— 用户根本看不见，
  体感就是「点了没反应」。现在试播结果（成功/失败+原因）**就地渲染在语句池卡片里**（`sayMsg`）。

### 新增 · 桌面模式：碎碎念 / 工作气泡点一下收起

- 与浏览器端 `onDismiss` 行为一致：气泡挂 `is-clickable`（`.pet-bubble.is-clickable{pointer-events:auto;cursor:pointer}` 本就有），
  并把气泡矩形随 `syncInputRegions()` 上报给主进程，`inputBusy()` 计入它 —— 否则窗口整窗穿透，点击根本进不来。
- 点击分派：余额气泡仍走展开/收起；碎碎念走 `clearWhisper()`；工作气泡清 `workOn` 与定时器。

### 修复 · 收起瞬间气泡「短暂变大一下」

- 气泡是 `opacity 0.25s` 淡出的，而旧的 `renderBubble()` 在隐藏路径上会先摘掉 `is-whisper`（字号 0.7473×、宽度上限 10.989em）
  与配图类 —— 尺寸类一变，正在淡出的气泡立刻跳回大号字号和大宽度。
- 现在 `slot === 'none'` 提前处理，只摘 `is-on`（触发淡出）与 `is-clickable`（撤销命中区），尺寸类留到下次真正渲染再改。

---

## [0.4.2] —— 修复：切「仅桌面」后宠物不出现（且一声不响）、用户配置被默认值覆盖

一句话：**桌面模式依赖的 Electron 运行时缺失时，插件会静默下载、失败后静默放弃，界面上零反馈；期间一旦配置读取失败，回退的默认值又会把用户配置整份覆盖掉。这一版把这两条链路都堵上了。**

### 修复 · Electron 运行时：单次下载失败就永久放弃 → 多镜像重试

- `ensureElectronDownload()` 原来是「一次尝试、整段 10 分钟超时」，遇到一次 `fetch failed`（DNS 抖动、连接被重置）就直接
  `warn` 一句后放弃，桌面宠物再也不起来 —— 用户侧感受就是「选了『仅桌面』，什么也没发生」。
- 现在改为**按镜像依次重试**：默认镜像 `https://npmmirror.com/mirrors/electron/`，第二个回退到 GitHub Releases；
  单次尝试超时 `attemptTimeoutMs`（默认 `min(总超时, 180s)`，用 `AbortController` 打断），失败立刻换源。
- 新增环境变量 `DSH_PET_ELECTRON_MIRRORS`（`|` 分隔）可自定义镜像顺序；`EnsureElectronOptions` 增加
  `attemptTimeoutMs` / `mirrors` 两个字段。
- 下载/解压各阶段补了带进度的 `log`（`download attempt 1/2`、`downloading 12.3MB / 137.7MB`、`ready in 42.1s`），
  排查时日志里能看出卡在哪一步。

### 修复 · 用户配置：解析失败被静默吞掉 → 告警 + 落盘前自动备份

- `readJsonc()` 原来 `catch { return undefined }`：文件读得到但解析不了（编码不对 / JSONC 语法错）时，
  整份用户配置被当成「用户没配置过」，**静默**回退包内默认值 —— 设置页随后一保存，默认值就
  （按白名单重建、且客户端带 `force=1` 绕过 409 守卫）把用户配置覆盖成几百字节的残缺文件。
- 现在：先读字节，按 `utf16le` / `utf16be` / `utf8` 依次尝试解码（BOM 与否都试；无 BOM 但满是 `0x00` 也试 UTF-16），
  解出来就用，并在非 UTF-8 时 `warnOnce` 提示「建议另存为 UTF-8」；**全部失败时也必须告警**
  （路径 + 原因 + 备份位置），不再无声无息。
- 新增 `backupUserConfig(paths)`：在 `PUT /config` 写盘前、以及「恢复默认」（`syncUserConfigFromDefault`）覆盖前，
  先把现有用户配置复制成 `main-config.jsonc.bak-<UTC 时间戳>`，失败只 warn、不阻塞保存。
  这样即便再遇到"保存把配置洗了"，也有东西能捞回来。
- 顶层是数组 / 标量等非对象内容一律视为非法配置（原来数组能蒙混过关）。

### 已知限制

- 设置页**仍然没有**「桌面端正在下载 Electron / 启动失败」的可见提示（要改 client bundle 的 UI，本版没动）。
  遇到桌面宠物迟迟不出现，请先看宿主日志里的 `[dsh-pet]` 行。

### 升级

```bash
dsh plugin add @tuweizhi/dsh-pet@0.4.2
```

---

## [0.4.1] —— 修复：client bundle 的模块 id 与包名不一致导致装不上

一句话：**0.4.0 在 DSH 0.2.1-rc.3 上装完报 `could not load "@tuweizhi/dsh-pet"`，这个版本修掉了。**

### 修复 · client 半侧注册 id 改为包名

- `lib/client.js` 里 `window.__ModuleLoader__.load({ id })` 从上游留下的 `"dsh-pet"` 改为 `"@tuweizhi/dsh-pet"`（`src/client/index.ts` 同步）。
- 原因：DSH 的 **client-modules 用包名当模块 id** 去 `graphRows` / `factories` 里查 factory，查不到就抛
  `could not load "@tuweizhi/dsh-pet": bundle ... loaded without registering "@tuweizhi/dsh-pet" via __ModuleLoader__.load`。
  0.4.0 改了包名却没跟着改注册 id，于是**宿主侧正常、界面侧整个插件加载失败**（宠物不出现）。
- 影响面：仅客户端模块注册名。**数据目录 `$DSH_HOME/dsh-pet`、路由 `/dsh-pet-7340`、cordis entry id `dsh-pet`、locale 命名空间都没动**，已装的配置与状态照旧。
- 自检补闸：`tools/verify-package.mjs` 新增第 5b 项——`lib/client.js` 注册的 id 必须与 `package.json` 的 `name` **逐字一致**，不一致直接拦住发布。

### 升级

```bash
dsh plugin add @tuweizhi/dsh-pet@0.4.1
```

装完刷新界面即可（无需清数据）。

---

## [0.4.0] —— 首个 fork 版本（基线：上游 dsh-pet 0.3.8）

一句话：**碎碎念彻底本地化（一个模型都不调）、气泡能点掉且能调大小停留、随机动作之间能留白、宠物再也不会被拖出屏幕**。

### 新增 · 碎碎念改为全本地语句池（零请求、零 token）

- 设置页新增「**碎碎念：语句池与气泡**」卡片：一个大文本框维护语句池，**一行一条**，空行不算数据，单行 ≤ 2000 字；卡片里实时显示「共 N 条」。
- 语句池留空时用**插件内置的 40 句保底**（`WHISPER_LINES_BUILTIN`，同样纯本地，不联网）。
- 到点从池子里**随机抽一句**，并**避开紧邻的上一句**（`pickWhisperLine` 按宠物记 `lastWhisperLine`），避免连着说同一句。
- 配图改为**按概率出图**：`whisperImageEnabled` 打开时约 **50%** 概率（`WHISPER_IMAGE_CHANCE = 0.5`）从本地 `memes` 池抽一张随文字一起显示；没抽中就是纯文字。图片与描述都是本地文件，**不再进任何请求**。
- 卡片里自带两个试播按钮：
  - 「**随机试一条**」——就地抽一句显示在卡片里（字号跟着「文字倍率」走，预览即所见）；
  - 「**让宠物说这句**」——`POST /dsh-pet-7340/whisper?...&text=<句子>`，屏幕上的宠物立刻说这句。
- 宿主侧 `POST /whisper` 支持 `?text=` 直接指定句子（≤ 200 字，超长返回 `{ok:false, reason:"text-too-long"}`）。
- **不再依赖"当前对话是否配了模型"**：`automaticWhisperSchedule(petEnabled, configuredPeriodSec)` 去掉了 `ctx.standaloneAi` 参数，以前"没配模型 → 碎碎念静默不跑"的情况不复存在。
- 旧的模型生成路径（`generateWhisper`）标记为**已停用**保留（不再被调用），`whisperModel` 配置项保留兼容但设置页不再展示/上报。
- 设置页文案同步改写：`whisperEnabledHint`、`whisperImageToggleHint`、`modelHint` 都明确说明"碎碎念不调模型、token 为 0"。

### 新增 · 碎碎念气泡：可点击收起、停留时长与文字倍率可调

- **点一下就收起**：碎碎念气泡与工作状态气泡加上 `is-clickable` + `onClick` + `title="点一下收起"`（`bubbleDismissTip`），点击只收气泡、不打断正在播的动画；不传 `onDismiss` 时气泡保持 `pointer-events:none` 穿透，不挡拖拽热区。
- **气泡停留时长** `whisperBubbleSec`（秒，默认 `10`，范围 `0–600`）：`0` = **不自动消失**，留到下一句碎碎念或被别的气泡/手动清掉。
- **文字倍率** `whisperTextScale`（默认 `1.35`，范围 `0.8–3`）：只放大文字（同时带动内边距/圆角/尾巴/宽度上限），配图尺寸单独压在原来的量级（`.pet-bub-img { --m: calc(var(--f0)*0.9) }`）。碎碎念气泡还加了 `font-weight:600` 与更深字色 `#1f1f1f`，短句一眼看清。
- 两个参数都写进 CSS 变量（`--dsh-pet-whisper-scale` / 停留毫秒），客户端再夹一次范围，宿主漏校验或手改配置文件写歪也不会把气泡撑爆。

### 新增 · 自动行为间隔：随机动作之间可以留白

- `eventsRefreshSec` 新增 `action`（秒，默认 `0`）：每个随机动作播完后先播待机、歇这么久再抽下一个动作。`0` = 不歇（旧行为），填 `20` 就是"动一下、歇 20 秒"。
- 设置页新增「**自动行为间隔**」卡片，可调碎碎念间隔（`≥60` 秒，默认 `300`）与动作间隔（`≥0`，默认 `0`）；`balance` 值原样读入回写，不会被"整段替换"字段冲掉。
- 校验口径统一：`eventsRefreshSec` 里 `action` 允许 `>= 0`，其余键仍要求 `> 0`。

### 修复 · 宠物再也不出屏幕

- 新增 `clampPetBox()`：拖拽跟随、甩抛起点、松手落点、**存档坐标渲染**全部经过它夹进视口——历史版本写进配置的越界坐标也会在渲染时被夹回来。
- 拖到边界时把该轴速度**清零**（手感是"顶住了"而不是弹回来），甩抛起点先夹再算轨迹（不会一抛就从屏外飞进来）。
- 边距只算**角色本体**：`HIT_BOX` 两侧的透明留白允许贴到屏幕边缘外（浏览器侧 `--dsh-pet-sl/--dsh-pet-sr` 从 `margin` 里扣掉；桌面侧 `anchorPixel` 按 `sideAllow` 扣减），`marginX = 0` 时角色真的贴边，而不是差半个身位。

### 新增 · 默认配置项（`assets/config.jsonc` 仍为出厂默认值）

```jsonc
"whisperLines": [],          // 本地语句池（一行一条）；空 = 用内置 40 句保底
"whisperBubbleSec": 10,      // 气泡停留秒数；0 = 不自动消失
"whisperTextScale": 1.35,    // 文字倍率（0.8–3）
"whisperImageEnabled": true, // 配图：约一半概率出图，不再消耗 token
"eventsRefreshSec": { "balance": 1800, "whisper": 300, "action": 0 }
```

`whisperModel` 保留原字段（`{"provider":"","model":""}`）但已停用；`whisperPrompt` 注释改为"仅对话用"。

### 兼容性与迁移

- **无需迁移**：不改包内路由前缀（`/dsh-pet-7340`）、不改用户数据目录（`$DSH_HOME/dsh-pet`），已有 `main-config.jsonc` / `memory.json` 原样读取；旧配置里没有新键时按上面的默认值走。
- 以前配了 `whisperModel` 的用户：该字段不再被读取，碎碎念改由本地语句池提供，设置页也不再显示这个下拉框（值仍留在文件里，可手动删）。
- 以前依赖"AI 按人设现编句子"的用法：请把人设里希望的句子写进语句池，或直接在对话里聊（对话仍走模型）。
- entry id 仍为 `dsh-pet`（与上游一致，替换安装不会多出一行）；包名变为 `@tuweizhi/dsh-pet`，可与上游并存于 npm，但同一 profile 二选一，详见 [NOTICE.md](NOTICE.md) §4。

### 本版本改动到的文件

`lib/index.js`、`lib/client.js`、`runtime/electron-helper/shared-core.js`、`runtime/electron-helper/sprite.js`、`assets/config.jsonc`（逐条 diff 见 [`patches/`](patches/)）。
