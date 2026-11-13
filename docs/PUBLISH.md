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

一键改（在仓库根目录）：

```sh
node -e "
const fs=require('fs');
const name='@你的ID/dsh-pet-mind';        // ← 改成你的
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.name=name; fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');
const f='src/client/index.ts';
fs.writeFileSync(f, fs.readFileSync(f,'utf8').replace(/id:\s*'[^']+'/, \"id: '\"+name+\"'\"));
const c='cordis.patch.yml';
fs.writeFileSync(c, fs.readFileSync(c,'utf8').replace(/^(\s*name:\s*)'[^']+'/m, \"\$1'\"+name+\"'\"));
console.log('改名完成：',name);
"
node tools/verify-package.mjs   # 必须通过：它会检查三处是否一致
```

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

## 4. 发布到 npm（可选，默认不做）

先想清楚三件事：**包名不能撞上游**、**素材授权**、**registry 账号**。

```sh
# 1) 换成你的 scope（scoped 包必须声明 public，否则默认私有要收费）
#    package.json: "name": "@你的ID/dsh-pet-mind"
# 2) 登录（会打开浏览器）
npm login
# 3) 发布（prepack 会自动跑 build + typecheck）
npm publish --access public
```

CI 里的 `Release` workflow 默认**只打包、不发布**（上传 tgz artifact，可选建 GitHub Release），
这是有意的：发布到哪个 registry、用哪个名字，必须你本人确认。

---

## 5. 发布前 checklist

- [ ] `node tools/verify-package.mjs` 通过（三处名字一致、无本机路径）
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 全绿
- [ ] `npm run build` 后 `lib/` 三份产物都在
- [ ] `LICENSE` 保留上游两段版权行，并追加了你自己的
- [ ] `NOTICE.md` 写清了来源链与 0.5 的改动
- [ ] `THIRD-PARTY-NOTICES.md` 里字体/表情包的状态你确认过（不确定就换素材）
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
