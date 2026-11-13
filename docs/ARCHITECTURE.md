# 架构说明（dsh-pet-mind / 0.5）

> 这份文档回答三个问题：**代码怎么组织**、**它怎么和 DSH 连起来**、**在 IntelliJ IDEA 里怎么打开和跑**。
> 面向第一次接手这个仓库的人（包括三个月后的你自己）。

---

## 1. 它是什么

一个 **DeepSeek Harness（DSH）插件**，不是独立应用：

- 宿主半侧（Node）是一个 Cordis 插件，DSH 的 Loader `import` 它并调用 `apply(ctx)`；
- 浏览器半侧（React）被打成**单文件经典脚本**，由 DSH 的模块系统加载进 Web UI；
- 桌面半侧（Electron）由宿主半侧拉起，用透明置顶窗把同一只宠物画到桌面上；
- 还有一种**独立模式**：不打开 DSH，用伪 ctx 跑宿主半侧，自己起一个 HTTP 服务。

三种形态共用同一份 `src/shared`（纯逻辑）与同一套 `assets`（配置/动画）。

---

## 2. 目录结构

```
dsh-pet-mind/
├─ src/
│  ├─ host/                     宿主半侧（Node，Cordis 插件）
│  │  ├─ index.ts               入口：export name/inject/apply；路由表 handlePetRoute
│  │  ├─ config.ts              配置读取/合并/校验（内置默认 + 用户层 + 文件宠物）
│  │  ├─ state.ts               轮询状态 S（前端 1s 轮询的唯一数据源）
│  │  ├─ chat.ts / whisper.ts   对话 / 碎碎念（0.5 起碎碎念纯本地）
│  │  ├─ helper-process.ts      探测/下载/拉起 Electron 桌面 Helper
│  │  ├─ mind/                  ★ 0.5 新增：心智层
│  │  │  ├─ index.ts            装配器：事件订阅、采样、路由、注入
│  │  │  ├─ context-meter.ts    上下文用量计量（纯逻辑）
│  │  │  ├─ privacy.ts          隐私闸门（名单/标题/默认拒绝）
│  │  │  ├─ coach.ts            停留/空闲/冷却 → 建议
│  │  │  ├─ memory.ts           双轨记忆（本地抽取摘要 + md 存储 + 索引）
│  │  │  └─ sensors/windows.ts  Windows 活跃度采集器（常驻 PowerShell）
│  │  └─ *.test.ts              与被测文件同目录的 node:test 单测
│  ├─ client/                   浏览器半侧（React，打成 IIFE 单文件）
│  │  ├─ index.ts               __ModuleLoader__.load({ id: 包名, factory })
│  │  ├─ pet.ts                 宠物卡片：动画链/拖拽/夹框/气泡
│  │  ├─ settings.ts            DSH 设置页「桌宠配置」
│  │  └─ bubble.ts              气泡渲染（可点收起）
│  ├─ shared/                   两端共用纯逻辑（无 DOM/无 React）
│  │  ├─ index.ts               桌面 shared-core 的入口（打成 window.PetShared）
│  │  ├─ motion.ts              anchorPixel / 拖拽几何（sideAllow 边距口径）
│  │  ├─ fonts.ts / displays.ts / physics.ts / whisper.ts ...
│  │  └─ types.ts               共享类型（Pet / 配置 / 事件帧）
│  └─ standalone/               独立模式（不打开 DSH）
│     ├─ cli.ts                 启动器：伪 ctx + HTTP 服务
│     └─ shims/                 三个只在 DSH 里存在的包的替身
├─ runtime/electron-helper/     桌面模式运行时（手写 JS，不经 TS 编译，随包发布）
│  ├─ main.js                   主进程：透明窗/命中区/托盘/IPC
│  ├─ preload.js                contextBridge
│  ├─ sprite.js / renderer.js   渲染：动画、气泡、拖拽
│  └─ shared-core.js            ← 由 src/shared 构建出来的 IIFE（不要手改）
├─ scripts/                     构建/自检/开发脚本 + mind/foreground-watch.ps1
├─ assets/                      出厂配置 config.jsonc、动画 webm、表情包、字体、图标
├─ tools/verify-package.mjs     发版自检（包结构/清单/本机路径泄漏）
├─ cordis.patch.yml             声明这是 bundle 插件、安装后的挂载行
└─ package.json                 清单 + dsh 元数据 + 构建脚本
```

**改代码前先记住一条**：`lib/` 是**构建产物**（`npm run build` 生成，已 gitignore），
`runtime/electron-helper/shared-core.js` 也是构建产物。手改它们不会进入 git，下次构建就没了——
要改行为，改 `src/`。

---

## 3. 构建链

```sh
npm install            # 只装依赖
npm run bundle         # tsdown：src/client → lib/client.js，src/host → lib/index.js，src/standalone → lib/standalone.js
npm run build:desktop-core   # src/shared → runtime/electron-helper/shared-core.js（IIFE，window.PetShared）
npm run types          # tsc → lib/types/*.d.ts（发布用）
npm run build          # 以上三步 + 收尾（scripts/prepare.js）
npm test               # node:test + 类型擦除，直接跑 src/**/*.test.ts
npm run typecheck      # tsc --noEmit（严格模式，noUnusedLocals/Params）
```

三个入口的产物形状是**硬约束**，别随手改 `tsdown.config.mjs`：

| 入口 | 产物 | 为什么是这个形状 |
|---|---|---|
| `src/client/index.ts` | `lib/client.js` | DSH 把插件客户端当**经典脚本**加载；必须是 `window.__ModuleLoader__.load({ id, factory })` 单文件，且 `id` **逐字等于 package.json 的 name** |
| `src/host/index.ts` | `lib/index.js` | 由 DSH Loader `import`，必须是 ESM、不能包 IIFE |
| `src/standalone/cli.ts` | `lib/standalone.js` | 要在没有 DSH 的机器上跑，`@deepseek-ai/*` 用 `src/standalone/shims/*` 替身 |

浏览器产物外面包了一层 `;(()=>{ ... })();`：同一个页面里重复执行（HMR / combo 请求重试）时，
顶层 `const` 不会二次声明报 `SyntaxError`。**这一层不要去掉。**

---

## 4. 它怎么和 DSH 连起来

### 4.1 安装时：bundle 插件与挂载行

`package.json` 里：

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },   // 告诉 DSH：这是 bundle，安装时把 patch 打进配置层
  "client": { "inject": ["@deepseek-ai/dsh-client-connection"], "platform": "web" }
}
```

`cordis.patch.yml` 决定插件在 DSH 配置树里的**挂载行**（entry id）。装进 profile 后，
DSH 启动时按这一行加载 `lib/index.js` 的 `export default`（即 `apply`）。

### 4.2 宿主半侧：`apply(ctx)`

DSH 通过 Cordis 注入服务，插件在 `src/host/index.ts` 顶部声明：

```ts
export const name = 'pet';
export const inject = ['webServer', 'agentDefaultModel', 'credentials', 'llm', 'commands', 'connection'];
```

- `ctx.webServer`：把 `/dsh-pet-7340/*` 路由挂上去（浏览器、设置页、斜杠命令、第三方插件都走它）；
- `ctx.llm` / `ctx.agentDefaultModel`：对话与（旧版）碎碎念用；
- `ctx.on('session/event', ...)`：**0.5 的上下文计量与记忆都挂在这里**；
- `ctx.systemPrompt.section(...)`：**0.5 的记忆注入**挂在这里（可选服务，老 DSH 没有就跳过）。

路由表在 `handlePetRoute(rawUrl, method, body, signal)` 里，按 `rest` 分支。
0.5 新增的分支只有一个：`/mind/*`（`/mind/state`、`/mind/context`、`/mind/memory`、
`/mind/summarize`、`/mind/pause`）。

### 4.3 浏览器半侧：模块注册

`src/client/index.ts`：

```ts
window.__ModuleLoader__.load({
  id: 'dsh-pet-mind',   // ← 必须等于 package.json 的 name
  factory: makeFactory(),
});
```

DSH 按包名从 `exports['./client']` 找到 `lib/client.js`，用 `id` 查 factory。
**改包名时这两处必须同时改**，否则控制台会报
`loaded without registering ... via __ModuleLoader__.load`，宠物不出现。

客户端注入 `@deepseek-ai/dsh-client-connection` 拿到 `connection`（api / events），
其余全靠轮询 `GET /dsh-pet-7340/state`（1 秒一次，counter 变了才渲染）。

### 4.4 桌面模式：Electron Helper

宿主侧 `helper-process.ts` 负责：探测 Electron（环境变量 → 本机 → 自动下载）→ 以子进程拉起
`runtime/electron-helper/main.js` → 通过 **stdout JSON 行 + 自定义 scheme** 的 bridge 通信
（DSH Desktop 2.0.3+ 会拦插件子进程的裸 HTTP，所以 bridge 不走 HTTP）。
每只桌面宠物一个透明小窗，窗口跟随宠物，只有身体命中区可点，其余点击穿透。

### 4.5 独立模式

`npm run standalone` → `lib/standalone.js`：把 `apply` 跑在一个最小伪 ctx 上，
用本机 HTTP 服务接管路由（默认 `http://127.0.0.1:3080/dsh-pet-7340/`）。
适合"只想看桌宠、不想开 DSH"，也是**最快的调试入口**。

---

## 5. 怎么跑起来

### 5.1 装进 DSH（日常使用）

```sh
# dsh web 用户
dsh plugin --profile web add <包名或本地路径>

# 桌面应用：应用内「插件管理」页填包名，或本地开发时用 npm pack 产出的 tgz
npm pack
# 然后装 tgz；装完重启 DSH
```

本地开发更快的循环：

```sh
npm run bundle              # 改 src 后重打 lib
# 重启 dsh web（或桌面应用），刷新页面
```

### 5.2 独立模式（不依赖 DSH，调试首选）

```sh
npm run bundle
node lib/standalone.js --check     # 先体检：配置/素材/Electron 是否就绪
node lib/standalone.js             # 起服务 + 桌面宠物
node lib/standalone.js --port 3100
```

### 5.3 心智层怎么验证

```sh
# 1) 单元测试（纯逻辑，不需要 DSH）
npm test

# 2) 起独立模式后，直接打路由
curl http://127.0.0.1:3080/dsh-pet-7340/mind/state
curl -X POST http://127.0.0.1:3080/dsh-pet-7340/mind/summarize

# 3) 记忆落在 $DSH_HOME/dsh-pet/memory/（Windows: %USERPROFILE%\.dsh\dsh-pet\memory）
```

> 独立模式下 `session/event` 不存在，所以上下文计量是空的；记忆摘要可以手动触发，
> 但需要先有对话缓冲（对话要接 DSH 的 llm 服务）。**心智层的主战场仍是 DSH 内运行。**

---

## 6. 在 IntelliJ IDEA Community 2025.2 打开

1. `File → Open`，选仓库根目录（**不要**选 `src/`），信任项目。
2. `Settings → Languages & Frameworks → Node.js`：
   - Node interpreter 指到 `E:\Program Files\nodejs\node.exe`；
   - Package manager 选 npm（`npm.cmd`）。
3. `Settings → Build → Build Tools → npm`：IDEA 会自动读到 `package.json` 的 scripts。
4. 运行配置（`Run → Edit Configurations → npm`）：
   - `bundle`：日常编译；
   - `test`：跑全部单测；
   - `standalone`：起独立模式（需要先 `bundle`）。
5. 调试：
   - **宿主半侧**：用 `npm run standalone` 的 Node 配置加 `--inspect`，在 `src/host/**` 打断点；
   - **浏览器半侧**：DSH Web UI 的 DevTools（`F12`）里看 `lib/client.js` 的 sourcemap 不可用，
     但 console 会打出插件日志；改完 `npm run bundle` + 刷新；
   - **桌面半侧**：`runtime/electron-helper` 是手写 JS，Electron 主进程可用 `--inspect`，
     渲染进程用 DevTools（见 `main.js` 文件头注释）。
6. 建议装插件：EditorConfig、Prettier（仓库有配置）、ESLint。
7. `.idea/` 已在 `.gitignore` 里，不会污染仓库。

---

## 7. 加一个新能力要动哪些文件

以"新增一个传感器"为例（完整清单，照抄即可）：

1. `src/host/mind/sensors/<name>.ts`：采集逻辑，导出 `start/stop`，失败要降级；
2. `src/host/mind/types.ts`：新采样/结果的类型；
3. `src/host/mind/index.ts`：在 `start()` 里装配、在 `view()` 里暴露（**脱敏**）；
4. `assets/config.jsonc` 的 `mind` 段：加开关与默认值（写中文注释）；
5. `src/client/settings.ts`：设置页加卡片（可选，但用户要能关）；
6. `src/host/mind/*.test.ts`：纯逻辑单测；
7. `docs/MIND.md`：数据流与隐私影响写清楚。

**硬规矩**：任何会读屏幕/窗口/键盘的能力，必须过 `privacy.ts`；任何出本机的数据，
必须走 `cloudAllowlist` 显式开关；任何新增的落盘文件，必须写在 `$DSH_HOME/dsh-pet/` 下。

---

## 8. 数据目录（用户数据不在仓库里）

```
$DSH_HOME/dsh-pet/
├─ main-config.jsonc      用户配置（设置页保存的覆盖层）
├─ memory.json            宠物对话记忆（chat）
├─ memory/                ★ 0.5 心智层记忆
│  ├─ INDEX.md            自动生成的索引
│  ├─ work/*.md           工作记忆（会话摘要）
│  └─ companion/*.md      陪伴记忆（称呼/偏好/约定）
├─ main-animation/        用户自定义动画（webm/mov）
├─ memes/                 用户自定义表情包
└─ pet/                   额外宠物种类（pet pack）
```

删掉 `memory/` 等于清空记忆；删掉 `memory.json` 等于清空宠物对话历史。两者互不影响。

---

## 9. 版本与许可

- 来源链：`PC2005-cloud/dsh-pet` v0.3.8（MIT）→ `TuWeiZhi/dsh-pet` 0.4.4（MIT）→ 本仓库（MIT）。
- 本仓库把 TuWeiZhi 只打在构建产物上的 patch 回植到了 TypeScript 源码，恢复完整构建链，
  并在其上新增 `mind` 心智层。逐条差异见 `NOTICE.md`。
- 素材（动画/表情包/字体）版权独立于代码，发布前请看 `THIRD-PARTY-NOTICES.md`。
