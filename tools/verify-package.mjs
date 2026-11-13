#!/usr/bin/env node
/**
 * verify-package.mjs —— 发版 / CI 自检（不联网、不装依赖，几毫秒跑完）。
 *
 * 与旧版（0.4.x）的区别：旧版假设 lib/ 是**提交进仓库的构建产物**，所以检查
 * "产物里的 fork 标记还在不在"。本仓库改回"从 src/ 构建"，自检重点变成
 * **清单与源码是否自洽、有没有把本机路径 / 令牌带进仓库**。
 *
 * 检查项：
 *   1. package.json 关键字段（name / main / exports / files / dsh.bundle / dsh.client）
 *   2. 浏览器半侧模块 id 必须与包名逐字一致（DSH 用它查 factory，错一个字宠物就不出现）
 *   3. cordis.patch.yml：entry id 行不能有行尾注释，name 必须等于包名
 *   4. assets/config.jsonc 能否剥注释后解析、pets 是否非空
 *   5. 代码文件不得出现本机绝对路径；全部文本文件不得出现令牌/私钥
 *   6. 构建产物不应入库（lib/ 若存在只给告警）
 *
 * 用法：node tools/verify-package.mjs（npm run verify）
 * 退出码：0 = 全过；1 = 有硬失败（CI 会红）
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];
const warnings = [];

const fail = (msg) => failures.push(msg);
const warn = (msg) => warnings.push(msg);

/** 读 JSON 文件（package.json） */
function readJson(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) {
    fail(`缺少文件：${rel}`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (error) {
    fail(`${rel} 不是合法 JSON：${error.message}`);
    return undefined;
  }
}

/** 剥 JSONC 注释（字符串里的 // 不误伤：逐字符状态机） */
function stripJsonc(text) {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 1;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === '/' && next === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      i += 1;
      continue;
    }
    out += c;
  }
  return out;
}

// ---- 1. package.json ----
const pkg = readJson('package.json') ?? {};
if (!pkg.name || typeof pkg.name !== 'string') fail('package.json 缺少 name');
if (pkg.main !== 'lib/index.js') fail(`main 必须是 lib/index.js（当前 ${pkg.main}）`);
if (!pkg.exports?.['.']?.default) fail('exports["."].default 缺失');
if (pkg.exports?.['./client']?.default !== './lib/client.js') fail('exports["./client"] 必须指向 ./lib/client.js');
if (!pkg.dsh?.bundle?.patch) fail('dsh.bundle.patch 缺失（DSH 不会把它当 bundle 装）');
if (pkg.dsh?.client?.platform !== 'web') fail('dsh.client.platform 必须是 web');
const files = Array.isArray(pkg.files) ? pkg.files : [];
for (const need of ['lib', 'src', 'assets/webm', 'runtime/electron-helper', 'assets/config.jsonc']) {
  if (!files.some((f) => f === need || need.startsWith(String(f) + '/'))) {
    warn(`files 里可能缺 ${need}（发布出去的包会少东西）`);
  }
}
if (!files.includes('scripts/mind')) warn('files 里缺 scripts/mind：心智层的桌面采集脚本不会随包发布');

// ---- 2. 浏览器模块 id ----
const clientEntry = join(ROOT, 'src', 'client', 'index.ts');
if (existsSync(clientEntry)) {
  const src = readFileSync(clientEntry, 'utf8');
  // id 前后可能有注释，允许中间夹最多 400 个字符
  const m = /__ModuleLoader__\.load\(\{[\s\S]{0,400}?id:\s*['"]([^'"]+)['"]/.exec(src);
  if (!m) {
    fail('src/client/index.ts 里找不到 __ModuleLoader__.load({ id: ... })');
  } else if (m[1] !== pkg.name) {
    fail(`客户端模块 id（${m[1]}）与包名（${pkg.name}）不一致——DSH 会报 loaded without registering`);
  }
} else {
  fail('缺少 src/client/index.ts');
}

// ---- 3. cordis.patch.yml ----
const cordis = join(ROOT, 'cordis.patch.yml');
if (!existsSync(cordis)) {
  fail('缺少 cordis.patch.yml');
} else {
  // 统一去掉 CR：Windows 检出时行尾是 CRLF，正则的 $ 会卡在 CR 前
  const text = readFileSync(cordis, 'utf8').replace(/\r/g, '');
  const idLine = /^[ \t]*-[ \t]*id:[ \t]*(\S+)[ \t]*$/m.exec(text);
  if (!idLine) fail('cordis.patch.yml 找不到形如 "    - id: <entry>" 的挂载行（且不能带行尾注释）');
  // name 允许带行尾注释（# ...），取引号内/到 # 之前的内容
  const nameValue = /^[ \t]*name:[ \t]*['"]?([^'"\n#]+?)['"]?[ \t]*(?:#.*)?$/m.exec(text);
  if (!nameValue) fail('cordis.patch.yml 缺少 name');
  else if (nameValue[1].trim() !== pkg.name) fail(`cordis.patch.yml 的 name（${nameValue[1].trim()}）与包名不一致`);
}

// ---- 4. 默认配置可解析 ----
const cfgPath = join(ROOT, 'assets', 'config.jsonc');
if (!existsSync(cfgPath)) {
  fail('缺少 assets/config.jsonc');
} else {
  try {
    const parsed = JSON.parse(stripJsonc(readFileSync(cfgPath, 'utf8')));
    if (!Array.isArray(parsed.pets) || parsed.pets.length === 0) fail('config.jsonc 的 pets 必须是非空数组');
  } catch (error) {
    fail(`assets/config.jsonc 剥注释后不是合法 JSON：${error.message}`);
  }
}

// ---- 5. 本机路径 / 令牌泄漏 ----
const SKIP_DIRS = new Set(['node_modules', '.git', 'lib', 'coverage', '.cache', '.demo-home']);
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|jsonc|md|yml|yaml|ps1|html|css|txt)$/i;
const SECRETS = [
  { re: /[A-Za-z]:\\Users\\/i, why: 'Windows 本机用户目录', codeOnly: true },
  { re: /idea-workspase/i, why: '作者本机路径', codeOnly: true },
  { re: /npm_[A-Za-z0-9]{30,}/, why: 'npm token', codeOnly: false },
  { re: /ghp_[A-Za-z0-9]{30,}/, why: 'GitHub token', codeOnly: false },
  { re: /-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----/, why: '私钥', codeOnly: false },
];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    // 本文件含有检测用的正则字面量，扫描时跳过自己
    if (entry === 'verify-package.mjs') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!TEXT_EXT.test(entry)) continue;
    if (st.size > 2 * 1024 * 1024) continue;
    const text = readFileSync(full, 'utf8');
    const isDoc = /\.(md|jsonc)$/i.test(entry);
    for (const s of SECRETS) {
      if (s.codeOnly && isDoc) continue; // 文档与示例配置允许出现示例路径
      if (s.re.test(text)) fail(`${relative(ROOT, full)} 疑似包含${s.why}`);
    }
  }
}
try {
  walk(ROOT);
} catch (error) {
  warn(`扫描源码时出错：${error.message}`);
}

// ---- 6. 构建产物不应入库 ----
if (existsSync(join(ROOT, 'lib', 'index.js'))) {
  warn('lib/ 存在构建产物——确认它没有被 git 跟踪（.gitignore 里应有 lib/）');
}

// ---- 汇总 ----
for (const w of warnings) console.warn(`[warn] ${w}`);
for (const f of failures) console.error(`[FAIL] ${f}`);
if (failures.length > 0) {
  console.error(`\n自检失败：${failures.length} 项（警告 ${warnings.length} 项）`);
  process.exit(1);
}
console.log(`自检通过（警告 ${warnings.length} 项）`);
