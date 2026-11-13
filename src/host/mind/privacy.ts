/**
 * 隐私闸门 —— 决定"这一刻能不能看屏幕"。
 *
 * 三条硬原则（与 README 的承诺一致）：
 *   1. **默认拒绝**：识别不出前台应用（提权窗口、全屏独占、采集器没起来）一律当敏感；
 *   2. **名单优先**：内置常见财产/密码/远程桌面应用，用户可加；
 *   3. **标题兜底**：窗口标题出现"密码/支付/转账/银行/验证码"等字样也拦——
 *      应用名识别不了的国产银行客户端，标题往往还是会暴露。
 *
 * 判定只看**进程名 + 窗口标题**，不看画面内容；标题不落盘、不外发，用完即弃
 * （调用方拿到 ActivitySample 后不要把 title 写进任何日志/记忆）。
 */

/** 隐私配置（用户在设置页/配置文件里可改；这里给安全默认值） */
export interface PrivacyConfig {
  /** 总开关关掉 = 立即停止一切采集（设置页的「隐私暂停」/热键） */
  paused?: boolean;
  /** 额外敏感进程（小写、不含 .exe） */
  apps?: readonly string[];
  /** 额外敏感标题正则（字符串形式，编译失败则忽略该条） */
  titlePatterns?: readonly string[];
  /** 允许"云端单帧分析"的应用白名单（只有这里的应用，画面才可能离开本机） */
  cloudAllowlist?: readonly string[];
  /** 识别不出应用时是否按敏感处理（默认 true；关掉等于放行一切未知应用） */
  unknownIsSensitive?: boolean;
}

/**
 * 内置敏感应用（进程名，小写、去 .exe）。
 *
 * 只放"看到画面就等于看到钱/密码/私密对话"的应用：即时通讯、支付、网银、
 * 密码管理器、远程桌面。浏览器不在列（它承载一切，靠标题规则兜底）。
 * 名单一定会过时——所以用户可加、标题可兜底、默认失败即关闭，三道保险。
 */
export const BUILTIN_SENSITIVE_APPS: readonly string[] = [
  // 即时通讯（聊天内容本身是隐私）
  'wechat',
  'weixin',
  'wechatapp',
  'qq',
  'tim',
  'dingtalk',
  'feishu',
  'lark',
  'telegram',
  'whatsapp',
  'discord',
  // 支付 / 钱包
  'alipay',
  'alipaysafe',
  'alipayportal',
  'unionpay',
  'paypal',
  // 网银 / 证券（大小写已归一；不同银行客户端名字差异大，标题规则兜底）
  'icbc',
  'ccb',
  'abchina',
  'boc',
  'cmb',
  'bcm',
  'spdb',
  'cib',
  'cebbank',
  'psbc',
  'citicbank',
  'pingan',
  'eastmoney',
  'hexin',
  // 密码管理器 / 密钥
  '1password',
  'bitwarden',
  'keepass',
  'keepassxc',
  'lastpass',
  'enpass',
  'dashlane',
  // 远程桌面（画面里可能是另一台机器的一切）
  'mstsc',
  'teamviewer',
  'anydesk',
  'todesk',
  'sunloginclient',
  'rustdesk',
  'parsec',
];

/** 标题兜底规则：命中即敏感（中英双语，宁可多拦） */
export const BUILTIN_TITLE_PATTERNS: readonly string[] = [
  '密码',
  '支付',
  '转账',
  '汇款',
  '银行',
  '余额',
  '验证码',
  '短信验证',
  '授权登录',
  '私钥',
  '助记词',
  '密钥',
  'password',
  'passcode',
  'payment',
  'transfer',
  'bank',
  'sign in',
  'log in',
  'verification code',
  'seed phrase',
  'private key',
];

/** 把进程名归一：小写、去目录、去 .exe */
export function normalizeApp(app: string | undefined): string {
  if (!app) return '';
  const base = app.replace(/\\/g, '/').split('/').pop() ?? app;
  return base.replace(/\.exe$/i, '').trim().toLowerCase();
}

function safeRegex(pattern: string): RegExp | undefined {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return undefined;
  }
}

/**
 * 判定这一刻能不能采集。
 *
 * @param sample 采样（只读 app/title；idleMs 不参与判定——人不在时由 Coach 负责待机）
 * @param cfg 用户配置
 */
export function checkPrivacy(sample: { app?: string; title?: string }, cfg: PrivacyConfig = {}): {
  capture: boolean;
  reason: 'sensitive-app' | 'sensitive-title' | 'unknown-app' | 'paused' | 'ok';
  matched?: string;
} {
  if (cfg.paused === true) return { capture: false, reason: 'paused' };
  const app = normalizeApp(sample.app);
  if (!app) {
    // 采集器没起来 / 提权窗口 / 全屏独占：无法判断 → 默认当敏感（失败即关闭）
    if (cfg.unknownIsSensitive !== false) return { capture: false, reason: 'unknown-app' };
    return { capture: true, reason: 'ok' };
  }
  const sensitive = new Set([...BUILTIN_SENSITIVE_APPS, ...(cfg.apps ?? []).map((a) => normalizeApp(a))]);
  if (sensitive.has(app)) return { capture: false, reason: 'sensitive-app', matched: app };
  // 进程名里带名单片段（如 'wechatdevtools'）也算——宁可多拦
  for (const name of sensitive) {
    if (name.length >= 4 && app.includes(name)) return { capture: false, reason: 'sensitive-app', matched: name };
  }

  const title = typeof sample.title === 'string' ? sample.title : '';
  if (title) {
    const patterns = [
      ...BUILTIN_TITLE_PATTERNS,
      ...(cfg.titlePatterns ?? []),
    ];
    for (const pattern of patterns) {
      const re = safeRegex(pattern);
      if (re && re.test(title)) return { capture: false, reason: 'sensitive-title', matched: pattern };
    }
  }
  return { capture: true, reason: 'ok' };
}

/**
 * 这个应用允不允许走**云端**单帧分析：
 * 只有用户在 `cloudAllowlist` 里显式写下的应用才可能——本地分析不受此限。
 */
export function cloudAllowed(app: string | undefined, cfg: PrivacyConfig = {}): boolean {
  const name = normalizeApp(app);
  if (!name) return false;
  const allow = (cfg.cloudAllowlist ?? []).map((a) => normalizeApp(a));
  return allow.includes(name);
}

/**
 * 是不是"我们自己的窗口"（桌宠的 Electron 透明窗 / 设置页）。
 *
 * 为什么必须排除：桌宠窗口被点一下就会变成前台窗口，如果把它当成"用户停留的应用"，
 * 宠物就会对着自己每 3 分钟建议一次"喝口水"——纯粹的骚扰。桌面模式下 Electron 进程
 * 的窗口标题固定带桌宠文案，这里用进程名 + 标题双重判断。
 */
export function isSelfWindow(app: string | undefined, title: string | undefined): boolean {
  const name = normalizeApp(app);
  const text = String(title ?? '');
  // **只认桌面 Helper 自己的窗口**：进程是 electron，且标题是它写死的那句
  //（"dsh-pet 桌宠（桌面模式）"）。
  //
  // 不能用"标题里出现 dsh-pet / 桌宠"当判据——实跑踩到的坑：DSH 主窗口的标题会带**会话名**，
  // 用户这次会话名里就有"桌宠"，于是整个 DSH 窗口被误判成宠物自己的窗口 →
  // capture 永远 false → 建议永远不发。
  return name === 'electron' && /dsh-pet\s*桌宠/i.test(text);
}
