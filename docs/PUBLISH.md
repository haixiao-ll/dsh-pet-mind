# 发布指南（GitHub / Gitee / npm）

> 目标：把这个仓库变成**你自己名下**的项目，同时不踩 MIT 的坑。
> 全程只需要改 3 个地方（包名 / 模块 id / 挂载行），其余交给 git。

---

## 0. 先确认：你可以公开发布吗？

可以。上游是 MIT（`PC2005-cloud/dsh-pet` v0.3.8 → `TuWeiZhi/dsh-pet` 0.4.4 → 本仓库），
MIT 明确允许修改、发布、商用。**唯一义务**：

1. 保留 `LICENSE` 全文（含上游两段版权行）；
2. 保留 `NOTICE.md` 与来源说明，写清楚你改了什么；
3. 不要用原作者的名字/头像暗示"官方版"；
4. **素材（动画/表情包/字体）的版权独立于代码**——见 `THIRD-PARTY-NOTICES.md`。
   公开发布前请确认字体与表情包的授权；不确定就把它们换掉（代码照常跑）。

---

## 1. 改成你自己的名字（3 处，必须同时改）

包名现在叫 `dsh-pet-mind`。你可以换成任意名字，但要一次改全：

| 位置 | 字段 | 为什么必须一致 |
|---|---|---|
| `package.json` | `name` | DSH 用它找插件、用它拼 `/plugins/<包名>/client.js` |
| `src/client/index.ts` | `__ModuleLoader__.load({ id })` | DSH 用 id 查 factory，不一致会报 `loaded without registering`，宠物不出现 |
| `cordis.patch.yml` | `name:` | 解析到本包入口 `lib/index.js` |

一键改（在仓库根目录，脚本会同时改 package.json / 客户端模块 id / cordis 挂载 name / 文档里的安装命令）：

```sh
node scripts/rename-fork.mjs   --name "@你的ID/dsh-pet-mind"   --repo "https://github.com/你的ID/dsh-pet-mind"

node tools/verify-package.mjs   # 必须通过：它会检查三处名字是否一致
npm run bundle                  # 客户端产物里写死了 id，必须重编
npm test
```

想先看会改哪些文件，加 `--dry-run`。脚本**不会**动路由前缀、数据目录与上游版权声明。

> **不要改的东西**：路由前缀 `/dsh-pet-7340`、用户数据目录 `$DSH_HOME/dsh-pet`、
> `PET_CALL_IDENTITY`。它们不是"名字"，改了会丢掉已有宠物状态与配置，
> 而且第三方插件（如女仆巡检）是按这个前缀集成的。

改完记得 `npm run bundle`（客户端产物里也写死了 id）。

---

## 2. 推到 GitHub

### 2.1 建仓库

网页建一个空仓库（**不要**勾 README/.gitignore/LICENSE，会和本地冲突），记下地址：

```
https://github.com/<你的ID>/dsh-pet-mind.git
```

或用 `gh` CLI：

```sh
gh repo create dsh-pet-mind --public --source=. --remote=origin
```

### 2.2 首次提交

```sh
git init
git add -A
git commit -m "feat: restore TS build chain and add mind layer (fork of TuWeiZhi/dsh-pet)"
git branch -M main
git remote add origin https://github.com/<你的ID>/dsh-pet-mind.git
git push -u origin main
```

> 推送要凭证。两种方式：
> - **HTTPS + Personal Access Token**：GitHub → Settings → Developer settings →
>   Personal access tokens → Fine-grained，只给这一个仓库 `Contents: Read and write`；
>   push 时用户名填你的 ID、密码填 token（**不要把 token 写进 URL 或任何文件**）。
> - **SSH**：本地已有 key 就 `git remote set-url origin git@github.com:<你的ID>/dsh-pet-mind.git`。
>
> 仓库里已经 `.gitignore` 了 `lib/`、`node_modules/`、`.idea/`、`.cache/`。
> 提交前跑一次 `node tools/verify-package.mjs`，它会拦下本机路径与令牌。

### 2.3 在 IntelliJ IDEA 里推（推荐日常用）

1. `File → Open` 打开仓库根目录；
2. `Settings → Version Control → Git` 确认 git 路径（`C:\Program Files\Git\cmd\git.exe`）；
3. `Git → Manage Remotes` 添加 origin；
4. 右下角 `Commit` 面板勾选改动 → `Commit and Push`；
5. 首次推送会弹凭证框：用户名 + token（勾"记住"）。

---

## 3. 同步到 Gitee（可选镜像）

1. Gitee 新建空仓库（不要初始化）；
2. 加一个远端并推：

```sh
git remote add gitee https://gitee.com/<你的ID>/dsh-pet-mind.git
git push gitee main
# 之后两边同步：git push origin main && git push gitee main
```

> Gitee 也支持"从 GitHub 导入仓库"，适合只想做镜像、不想维护第二条 remote 的情况。
> 注意 Gitee 对单文件大小有限制（动画 webm 单个都不到 1MB，没问题；整个仓库约 300MB，
> 首次推送会比较慢，属正常）。

---

## 4. 发布到 npm

### 4.1 包名：优先用现有的 `dsh-pet-mind`（不要加 scope）

- 已确认 npm 上 **`dsh-pet-mind` 未被占用**（`npm view dsh-pet-mind` 返回 404）；
- DSH 的 client 模块 id 与插件名是**逐字绑定**的：
  `src/client/index.ts` 的 `id`、`cordis.patch.yml` 的 `name`、`package.json` 的 `name` 必须一致；
- 如果你改成 `@你的ID/dsh-pet-mind`，必须同时改这三处并重新构建，否则装上去会报
  “loaded without registering … via __ModuleLoader__.load” 或入口不激活。

### 4.2 一次性准备

```sh
npm login          # 浏览器登录；建议账号开 2FA
npm whoami         # 应输出你的 npm 用户名
```

- 把 `package.json` 的 `repository` / `homepage` / `bugs` 里的 `your-id` 换成你的 GitHub ID；
- 想清楚素材：`assets/memes`（梗图）与 `assets/fonts`（上首软糖体）权利状态不明，
  公开分发前建议删除或替换（删除不会坏，表情包自动失效、字体回退系统字体）；
- 确认 `LICENSE` / `NOTICE.md` / `THIRD-PARTY-NOTICES.md` 随包发布（`files` 已包含）。

### 4.3 本地预检

```sh
npm run typecheck
npm test
node tools/verify-package.mjs
npm publish --dry-run     # 只打包、不发布，检查文件清单与体积
```

本仓库实测（0.5.0）：**434 个文件，压缩后 63.0MB，解包 67.1MB**——在 npm 限制内，
但首次发布会比较慢（上传几分钟属正常）。

### 4.4 发布

```sh
npm publish               # 未加 scope，默认 public
# 有 2FA 会提示输入一次性验证码
```

- `prepack` 会自动跑 `build + typecheck + prepack-check`，任何一步失败都会**阻止发布**；
- 不要用 `--force` 跳过；
- 若只是想先发测试版：`npm publish --tag beta`，正式版再 `npm publish --tag latest`。

### 4.5 发布后验证

```sh
npm view dsh-pet-mind version          # 0.5.0
npm view dsh-pet-mind dist.tarball
mkdir /tmp/try && cd /tmp/try && npm init -y && npm i dsh-pet-mind
"…\dsh.cmd" plugin --profile desktop add dsh-pet-mind
```

装完**完全退出 DSH 再启动**；心智层默认已开，不需要写配置。

### 4.6 后续版本

1. 改 `package.json` 的 `version`（SemVer：修复 → patch，新功能 → minor）；
2. `CHANGELOG.md` 增加一节；
3. `npm publish`（同一版本号不能重复发布）；
4. 需要撤销刚发的版本：`npm unpublish dsh-pet-mind@x.y.z`（24 小时内且无依赖才允许；
   **能不用就不用**，优先发新 patch）。

### 4.7 自动化（可选）

当前 `Release` workflow 只打包、不发布。要自动发布，二选一：

- **Token**：npm 后台创建 Granular Token（只勾 `dsh-pet-mind` 的 read/write），
  在 GitHub 仓库 Secrets 里存 `NPM_TOKEN`，发布步骤用 `npm publish --access public` + `NODE_AUTH_TOKEN`；
- **OIDC provenance**：`npm publish --provenance --access public`，配合 GitHub Actions 的
  `id-token: write` 权限，无需长期 token（npm 账号需开启 2FA）。

无论哪种，**不要把 token 写进 `.npmrc` 提交到仓库**。

### 4.8 常见错误

| 错误 | 原因 / 处理 |
|---|---|
| `ENEEDAUTH` | 没登录：`npm login` 或配置 `NODE_AUTH_TOKEN` |
| `E403` + 2FA 提示 | 账号开了 2FA：按提示输入 OTP，或改用 Granular Token |
| `E409` | 版本已存在：bump `version` 再发 |
| `E402 Payment Required` | 发的是 scoped 包且没加 `--access public` |
| `EPUBLISHCONFLICT` | 24 小时内撤销过同名版本，或版本号重复 |
| 上传超时 | 63MB 包网络慢：重试；不要重复触发多次发布 |

---

## 5. 发布前 checklist

- [ ] `node tools/verify-package.mjs` 通过（三处名字一致、无本机路径）
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 全绿
- [ ] `npm run build` 后 `lib/` 三份产物都在
- [ ] `LICENSE` 保留上游两段版权行，并追加了你自己的
- [ ] `NOTICE.md` 写清了来源链与 0.5.x 的改动
- [ ] `THIRD-PARTY-NOTICES.md` 里字体/表情包的状态你确认过（不确定就删掉 `assets/memes` 与 `assets/fonts`）
- [ ] `docs/PRIVACY.md` 与 `docs/LEGAL.md` 的合规提示符合你的发布场景
- [ ] `docs/TESTING.md` 的实测记录与当前版本一致（至少覆盖：上下文、工作/陪伴记忆、OCR 建议、待机、隐私闸门）
- [ ] `SECURITY.md` / `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` 已随仓库发布
- [ ] README 的"做不到什么"没有夸大能力（不要宣称"懂你在干什么""自动操作"）
- [ ] `docs/ARCHITECTURE.md` 里的仓库地址/包名换成了你的
- [ ] 第一次 push 后 GitHub Actions 的 CI 是绿的

---

## 6. 之后怎么和上游同步

上游（`TuWeiZhi/dsh-pet` 与更上游的 `PC2005-cloud/dsh-pet`）还会更新。本仓库的做法是
**以 0.3.8 为基线、把改动全部落在 TypeScript 源码里**，所以同步时：

```sh
git remote add upstream https://github.com/TuWeiZhi/dsh-pet.git
git fetch upstream
git diff upstream/main -- src/ | less    # 先看上游改了什么
# 按需 cherry-pick 或手工合并；冲突优先看 docs/ARCHITECTURE.md 的模块边界
```

心智层（`src/host/mind/**`、`docs/MIND.md`、`mind` 配置段）是新增目录/字段，
与上游冲突的概率很低——这也是当初把它拆成独立模块的原因。
