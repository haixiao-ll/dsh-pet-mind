import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { MemoryStore, renderWorkDoc, safeSlug, summarizeLocally, type ChatLine } from './memory.ts';

const T0 = new Date('2026-11-13T14:00:00').getTime();

const LINES: ChatLine[] = [
  { role: 'user', text: '帮我给桌宠加一个上下文用量的显示' },
  { role: 'assistant', text: '好的，我先看 session/event 里有没有 usage。' },
  { role: 'user', text: '决定采用 host 侧监听，不动客户端' },
  { role: 'assistant', text: '已实现 ContextMeter。' },
  { role: 'user', text: '下一步：把记忆注入系统提示词，TODO 还要补测试' },
];

test('summarizeLocally：标题取第一句用户输入，进展取最近用户发言，决策/待办按关键词捞', () => {
  const s = summarizeLocally(LINES);
  assert.match(s.title, /上下文用量/);
  assert.equal(s.progress[0], '下一步：把记忆注入系统提示词，TODO 还要补测试');
  assert.ok(s.decisions.some((d) => d.includes('决定采用')));
  assert.ok(s.todos.some((d) => d.includes('TODO')));
  assert.ok(s.raw.length <= 6);
});

test('renderWorkDoc：front-matter + 五个小节齐全，空列表有占位', () => {
  const doc = renderWorkDoc(summarizeLocally(LINES), { sessionId: 's-1', at: T0 });
  assert.match(doc, /^---\ntitle: /);
  assert.match(doc, /session: "s-1"/);
  for (const head of ['## 一句话', '## 进展', '## 决策', '## 待办', '## 原始线索']) {
    assert.ok(doc.includes(head), `缺少 ${head}`);
  }
  const empty = renderWorkDoc(summarizeLocally([{ role: 'user', text: '你好' }]), { sessionId: 's' });
  assert.match(empty, /没有识别到明确的决策句/);
});

test('safeSlug：Windows 非法字符与空白压成 -', () => {
  assert.equal(safeSlug('a b/c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j');
  assert.equal(safeSlug('   '), 'session');
});

test('MemoryStore：写入工作记忆 + 重建索引 + 注入卡片', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-pet-mem-'));
  try {
    const store = new MemoryStore(home);
    const file = store.writeWork(summarizeLocally(LINES), { sessionId: 's-1' });
    assert.ok(existsSync(join(home, 'dsh-pet', 'memory', 'work', file)));
    const index = store.readIndex();
    assert.match(index, /# 记忆索引/);
    assert.match(index, /上下文用量/);

    store.appendCompanion('以后叫我老板就行');
    assert.match(store.companionText(), /老板/);
    assert.match(store.readIndex(), /陪伴记忆（1）/);

    const injection = store.injectionText();
    assert.match(injection, /共同的记忆/);
    assert.ok(injection.length < 1700);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('陪伴记忆判据：只捞称呼/偏好/约定，不捞普通工作指令', () => {
  assert.equal(MemoryStore.worthRemembering('以后叫我老板'), true);
  assert.equal(MemoryStore.worthRemembering('把 tests 跑一遍'), false);
  assert.equal(MemoryStore.worthRemembering('短'), false);
});

test('写文件是原子的：目录里不会留下 .tmp 残留', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-pet-mem-'));
  try {
    const store = new MemoryStore(home);
    store.writeWork(summarizeLocally(LINES), { sessionId: 's' });
    store.writeWork(summarizeLocally(LINES), { sessionId: 's2' });
    const dir = join(home, 'dsh-pet', 'memory', 'work');
    assert.ok(readdirSync(dir).length >= 2);
    for (const f of readdirSync(dir)) assert.ok(!f.endsWith('.tmp'), `不应有临时文件：${f}`);
    // 索引也要能被读回（写坏的话这里会抛）
    assert.ok(readFileSync(join(home, 'dsh-pet', 'memory', 'INDEX.md'), 'utf8').length > 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
