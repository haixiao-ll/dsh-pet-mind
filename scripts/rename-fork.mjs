#!/usr/bin/env node
/**
 * rename-fork.mjs —— 一条命令把仓库改成你自己的名字（发布前必跑）。
 *
 * 为什么需要它：这个插件有**三处名字必须逐字一致**，漏一处就是"装上了但宠物不出现"：
 *   1. `package.json` 的 `name`          —— DSH 用它找插件、拼 /plugins/<包名>/client.js
 *   2. `src/client/index.ts` 的模块 id    —— DSH 用 id 查 factory（不等就报 loaded without registering）
 *   3. `cordis.patch.yml` 的 `name:`      —— 解析到本包入口 lib/index.js
 * 另外还要把仓库地址从占位符换成你的。手改容易漏，所以脚本一次改全并自检。
 *
 * 用法：
 *   node scripts/rename-fork.mjs --name "@你的ID/dsh-pet-mind" --repo "https://github.com/你的ID/dsh-pet-mind"
 *   node scripts/rename-fork.mjs --name "dsh-pet-mind" --repo "https://gitee.com/你的ID/dsh-pet-mind" --dry-run
 *
 * 只改"名字与地址"，**不改**：
 *   - 路由前缀 `/dsh-pet-7340`、用户数据目录 `$DSH_HOME/dsh-pet`、`PET_CALL_IDENTITY`
 *     （改了会丢已有宠物状态与配置，第三方插件也按这个前缀集成）；
 *   - 上游版权声明（LICENSE / NOTICE 里的来源链）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);

function arg(name, fallback = '') {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const dryRun = args.includes('--dry-run');
const nextName = arg('name').trim();
const nextRepo = arg('repo').trim().replace(/\.git$/, '').replace(/\/$/, '');

if (!nextName) {
  console.error('用法：node scripts/rename-fork.mjs --name "@你的ID/dsh-pet-mind" --repo "https://github.com/你的ID/dsh-pet-mind" [--dry-run]');
  process.exit(1);
}
// npm 包名规则（这里只做"明显不合法"的拦截；scoped 允许 @scope/name）
if (!/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(nextName) || nextName.length > 214) {
  console.error(`包名不合法：${nextName}（只允许小写字母/数字/._-，可用 @scope/ 前缀）`);
  process.exit(1);
}
if (nextRepo && !/^https?:\/\/(github\.com|gitee\.com)\/[^/\s]+\/[^/\s]+$/.test(nextRepo)) {
  console.error(`仓库地址不合法：${nextRepo}（例：https://github.com/你的ID/dsh-pet-mind）`);
  process.exit(1);
}

const changes = [];
function patch(rel, fn) {
  const file = resolve(ROOT, rel);
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) changes.push(rel);
  if (!dryRun && after !== before) writeFileSync(file, after, 'utf8');
  return { before, after };
}

// ---- 1. package.json ----
const pkgRaw = readFileSync(resolve(ROOT, 'package.json'), 'utf8');
const pkg = JSON.parse(pkgRaw);
const oldName = pkg.name;
if (!oldName) {
  console.error('package.json 里没有 name');
  process.exit(1);
}
patch('package.json', () => {
  const next = {
    ...pkg,
    name: nextName,
    ...(nextRepo
      ? {
          homepage: nextRepo + '#readme',
          repository: { type: 'git', url: 'git+' + nextRepo + '.git' },
          bugs: { url: nextRepo + '/issues' },
        }
      : {}),
  };
  return JSON.stringify(next, null, 2) + '\n';
});

// ---- 2. 浏览器侧模块 id（必须逐字等于包名）----
patch('src/client/index.ts', (text) => {
  const re = /(id:\s*)['"][^'"]+['"]/;
  if (!re.test(text)) throw new Error('src/client/index.ts 里找不到 id: ...');
  return text.replace(re, (_, prefix) => prefix + "'" + nextName + "'");
});

// ---- 3. cordis 挂载行（name 指模块；id 是持久化行标识，保持 dsh-pet 不动）----
patch('cordis.patch.yml', (text) => {
  const re = /^(\s*name:\s*)['"]?[^'"\n#]+['"]?/m;
  if (!re.test(text)) throw new Error('cordis.patch.yml 里找不到 name:');
  return text.replace(re, (_, prefix) => prefix + "'" + nextName + "'");
});

// ---- 4. 文档里出现的旧包名（安装命令）----
for (const rel of ['README.md', 'docs/ARCHITECTURE.md', 'docs/PUBLISH.md']) {
  patch(rel, (text) => text.split(oldName).join(nextName));
}

// ---- 汇总 ----
const files = dryRun ? changes : changes;
console.log(dryRun ? '[dry-run] 将要修改：' : '改名完成，已修改：');
for (const f of files) console.log('  - ' + f);
if (!nextRepo) console.log('（没给 --repo，仓库地址保持原样）');
console.log('');
console.log('下一步：');
console.log('  node tools/verify-package.mjs   # 三处名字是否一致 + 清单自检');
console.log('  npm run bundle                  # 客户端产物里也写死了 id，必须重编');
console.log('  npm test                        # 1021 条测试');
