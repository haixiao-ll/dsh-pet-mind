/**
 * Memory —— 双轨长期记忆（工作记忆 / 陪伴记忆）。
 *
 * 为什么分两轨：
 *   - **工作记忆**记"我们在做什么"：来自 DSH 会话的用户/助手消息，产出到
 *     `memory/work/YYYY-MM-DD_HHmm_<会话>.md`，供新会话 / 子支线"快速学习"；
 *   - **陪伴记忆**记"我们是什么关系"：称呼、偏好、约定，产出到
 *     `memory/companion/notes-YYYY-MM.md`，不掺工作细节。
 *   混在一起会互相污染：工作摘要里的技术名词会让宠物说话变味，
 *   而"主人不喜欢被叫老板"这种约定对写代码没有帮助。
 *
 * 存储原则：
 *   - 纯本地 markdown，用户可直接用编辑器改、可以进 git；
 *   - 原子写（先写 .tmp 再 rename），断电/崩溃不会留下半截文件；
 *   - INDEX.md 每次写入后重建（最多几十行，代价可忽略）；
 *   - **不写窗口标题、不写截图、不写密钥**——只写用户自己打出来的话与模型回复。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MemoryDocMeta } from './types';

/** 一条会话消息（只保留与"记忆"有关的字段） */
export interface ChatLine {
  role: 'user' | 'assistant';
  text: string;
  at?: number;
}

/** 本地抽取出的工作摘要 */
export interface WorkSummary {
  title: string;
  oneLine: string;
  progress: string[];
  decisions: string[];
  todos: string[];
  /** 原始线索（最近几条对话，截断后）——给"人肉回忆"用，不喂模型 */
  raw: string[];
  tags: string[];
}

/** 单行规整：换行压成空格、去多余空白、截断 */
function inline(text: string, max = 120): string {
  const s = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * 本地抽取式摘要（**零 token、零网络**，默认路径）。
 *
 * 不是"总结得很好"，而是"把还会想起来的线索留在纸上"：
 *   - 标题：第一句用户输入；
 *   - 进展：最近几条用户发言（人自己说的话最能代表意图）；
 *   - 决策/待办：按关键词捞（决定/采用/改成；TODO/下一步/还没）；
 *   - 关键词：ASCII 词频（中文分词不可靠，硬切反而产生噪音）。
 *
 * 想要更通顺的摘要，可以再调一次模型润色（见 summarizeWithModel 的接口约定），
 * 但**默认不调**：临近上限时再塞长 prompt，会把好不容易省下的上下文又吃掉。
 */
export function summarizeLocally(lines: readonly ChatLine[]): WorkSummary {
  const userLines = lines.filter((l) => l.role === 'user').map((l) => inline(l.text, 200));
  const all = lines.map((l) => inline(l.text, 200)).filter(Boolean);
  const title = inline(userLines[0] ?? all[0] ?? '未命名会话', 28) || '未命名会话';
  const oneLine = inline(userLines[userLines.length - 1] ?? all[all.length - 1] ?? '（暂无内容）', 80);
  const recent = userLines.slice(-6).reverse();

  const decisions = all.filter((l) => /决定|采用|方案|结论|改成|换成|我选/.test(l)).slice(-5);
  const todos = all.filter((l) => /待办|下一步|还要|尚未|记得|todo|fixme/i.test(l)).slice(-5);
  const keywordText = all.join(' ');
  const freq = new Map<string, number>();
  for (const word of keywordText.match(/[A-Za-z][A-Za-z0-9_\-]{2,}/g) ?? []) {
    const key = word.toLowerCase();
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  const tags = [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
  return {
    title,
    oneLine,
    progress: recent,
    decisions,
    todos,
    raw: all.slice(-6),
    tags,
  };
}

/** 渲染工作记忆文档（纯函数，便于测试/预览） */
export function renderWorkDoc(summary: WorkSummary, meta: { sessionId: string; at?: number }): string {
  const at = new Date(meta.at ?? Date.now());
  const iso = at.toISOString();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const local = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const list = (items: string[], empty: string): string =>
    items.length > 0 ? items.map((s) => `- ${s}`).join('\n') : `- ${empty}`;
  return [
    '---',
    `title: ${JSON.stringify(summary.title)}`,
    `date: ${iso}`,
    `session: ${JSON.stringify(meta.sessionId)}`,
    `tags: [${summary.tags.map((t) => JSON.stringify(t)).join(', ')}]`,
    '---',
    '',
    `# ${summary.title}`,
    '',
    `> 生成于 ${local}（本地抽取，未调用模型）`,
    '',
    '## 一句话',
    '',
    summary.oneLine,
    '',
    '## 进展（按时间倒序）',
    '',
    list(summary.progress, '（没有记录到用户发言）'),
    '',
    '## 决策',
    '',
    list(summary.decisions, '（没有识别到明确的决策句）'),
    '',
    '## 待办',
    '',
    summary.todos.length > 0 ? summary.todos.map((s) => `- [ ] ${s}`).join('\n') : '- （没有识别到待办）',
    '',
    '## 原始线索',
    '',
    list(summary.raw, '（暂无）'),
    '',
  ].join('\n');
}

/** 渲染陪伴记忆的一条（纯函数） */
export function renderCompanionNote(text: string, at = Date.now()): string {
  const d = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `- ${stamp} ${inline(text, 200)}`;
}

/** 文件名安全化：去掉 Windows 非法字符 */
export function safeSlug(text: string, fallback = 'session'): string {
  const s = String(text ?? '')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s.slice(0, 40) || fallback;
}

/**
 * 记忆仓库（文件系统适配层）。
 *
 * 所有路径都在 `$DSH_HOME/dsh-pet/memory/` 下——与插件其余用户数据同一棵树，
 * 卸载/备份/迁移只需要搬一个目录。
 */
export class MemoryStore {
  readonly root: string;
  readonly workDir: string;
  readonly companionDir: string;

  constructor(dshHome: string) {
    this.root = join(dshHome, 'dsh-pet', 'memory');
    this.workDir = join(this.root, 'work');
    this.companionDir = join(this.root, 'companion');
  }

  /** 建目录（幂等；首次使用时调用） */
  ensure(): void {
    for (const dir of [this.root, this.workDir, this.companionDir]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
  }

  /** 原子写：先写同目录 .tmp，再 rename（rename 在同一卷上是原子的） */
  private atomicWrite(path: string, text: string): void {
    const tmp = path + '.tmp';
    writeFileSync(tmp, text, 'utf8');
    renameSync(tmp, path);
  }

  /** 写一份工作记忆，返回文件名 */
  writeWork(summary: WorkSummary, meta: { sessionId: string; at?: number }): string {
    this.ensure();
    const at = new Date(meta.at ?? Date.now());
    const pad = (n: number): string => String(n).padStart(2, '0');
    const name = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}${pad(at.getMinutes())}_${safeSlug(meta.sessionId, 'main')}.md`;
    this.atomicWrite(join(this.workDir, name), renderWorkDoc(summary, meta));
    this.rebuildIndex();
    return name;
  }

  /** 追加一条陪伴记忆（按月一个文件，天然分卷） */
  appendCompanion(text: string, at = Date.now()): void {
    const trimmed = inline(text, 200);
    if (!trimmed) return;
    this.ensure();
    const d = new Date(at);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const file = join(this.companionDir, `notes-${d.getFullYear()}-${pad(d.getMonth() + 1)}.md`);
    const exists = existsSync(file);
    const header = `# 陪伴记忆 ${d.getFullYear()}-${pad(d.getMonth() + 1)}\n\n> 只记称呼、偏好、约定；工作细节在工作记忆里。\n\n`;
    writeFileSync(file, (exists ? readFileSync(file, 'utf8') : header) + renderCompanionNote(trimmed, at) + '\n', 'utf8');
    this.rebuildIndex();
  }

  /** 列目录下的 .md（最新在前） */
  private list(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md') && !f.endsWith('.tmp'))
      .sort()
      .reverse();
  }

  /** 文档元信息（标题取首行 # 标题，取不到用文件名） */
  docMeta(dir: 'work' | 'companion', file: string): MemoryDocMeta {
    const full = join(dir === 'work' ? this.workDir : this.companionDir, file);
    let text = '';
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      /* 文件被删/不可读：返回文件名占位，不抛 */
    }
    const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? file.replace(/\.md$/, '');
    const at = /^date:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? '';
    const tags = /^tags:\s*\[(.*)\]$/m.exec(text)?.[1]?.split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean) ?? [];
    return { file, title, at, tags };
  }

  /** 重建 INDEX.md（写记忆后调用；几十个文件的开销可忽略） */
  rebuildIndex(): void {
    this.ensure();
    const work = this.list(this.workDir).map((f) => this.docMeta('work', f));
    const companion = this.list(this.companionDir).map((f) => this.docMeta('companion', f));
    const line = (kind: 'work' | 'companion', m: MemoryDocMeta): string => {
      const tags = m.tags.length > 0 ? ` · ${m.tags.join(', ')}` : '';
      return `- [${m.title}](${kind}/${m.file})${tags}`;
    };
    const body = [
      '# 记忆索引',
      '',
      '> 自动生成，勿手改（改文档本身即可，索引会在下次写入时重建）。',
      '',
      `## 工作记忆（${work.length}）`,
      '',
      work.length > 0 ? work.slice(0, 30).map((m) => line('work', m)).join('\n') : '- （还没有）',
      '',
      `## 陪伴记忆（${companion.length}）`,
      '',
      companion.length > 0 ? companion.slice(0, 12).map((m) => line('companion', m)).join('\n') : '- （还没有）',
      '',
    ].join('\n');
    this.atomicWrite(join(this.root, 'INDEX.md'), body);
  }

  /** 读索引原文（不存在返回空串） */
  readIndex(): string {
    try {
      return readFileSync(join(this.root, 'INDEX.md'), 'utf8');
    } catch {
      return '';
    }
  }

  /** 最近 N 份工作记忆的正文（供「快速学习」一次性读入） */
  recentWork(count = 3): { file: string; text: string }[] {
    return this.list(this.workDir)
      .slice(0, count)
      .map((file) => ({ file, text: readFileSync(join(this.workDir, file), 'utf8') }));
  }

  /** 最近所有陪伴记忆正文（通常很小，直接拼接） */
  companionText(): string {
    return this.list(this.companionDir)
      .map((f) => readFileSync(join(this.companionDir, f), 'utf8'))
      .join('\n');
  }

  /**
   * 注入给模型的"记忆卡片"：**只给索引 + 最近一份的一句话**，不整份灌进去。
   *
   * 为什么不全灌：记忆是给"需要时查"的，不是每轮都背一遍——全灌会把窗口吃掉，
   * 而用户真正想要的"快速学习"往往只需要知道"之前做过什么、结论是什么"。
   * 需要细节时，模型可以按索引里的路径读文件（DSH 的文件工具能读）。
   */
  injectionText(limit = 1600): string {
    const index = this.readIndex();
    if (!index) return '';
    const recent = this.recentWork(1)[0];
    const oneLine = recent ? /## 一句话\n\n(.+)/.exec(recent.text)?.[1]?.trim() ?? '' : '';
    const trimmed = index.length > limit ? index.slice(0, limit) + '\n…（索引过长已截断）' : index;
    return [
      '【你与主人共同的记忆（由桌宠 dsh-pet 维护，仅供理解上下文，不要主动复述）】',
      trimmed,
      oneLine ? `\n最近一次工作的一句话结论：${oneLine}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** 给"陪伴记忆"用的启发式：这句话值不值得记（称呼/偏好/约定） */
  static worthRemembering(text: string): boolean {
    const s = String(text ?? '').trim();
    if (s.length < 4 || s.length > 300) return false;
    return /叫我|喊我|我喜欢|我不喜欢|我讨厌|以后|记住|别再|别忘|约定|习惯|偏好|称呼/.test(s);
  }
}
