import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSuggestionPrompt, clampChars, cleanSuggestion } from './suggest.ts';

test('prompt：带应用名与 OCR 文本，且要求具体、允许 SKIP', () => {
  const p = buildSuggestionPrompt({ text: '报错：TS2339 属性不存在', app: 'Code', maxChars: 30 });
  assert.match(p.user, /前台应用：Code/);
  assert.match(p.user, /TS2339/);
  assert.match(p.system, /SKIP/);
  // 用户要求：提示词最后必须约束"只做建议，不做实际操作"
  assert.match(p.system, /只做出建议，不做任何实际操作/);
  assert.equal(p.maxChars, 30);
});

test('prompt：OCR 文本超长会被截断，应用名缺失写"未知"', () => {
  const p = buildSuggestionPrompt({ text: '字'.repeat(5000) });
  assert.ok(p.user.length < 1400);
  assert.match(p.user, /前台应用：未知/);
});

test('cleanSuggestion：压空白、去引号、按上限截断', () => {
  assert.equal(cleanSuggestion('「先  把  测试 跑 一遍」'), '先 把 测试 跑 一遍');
  assert.equal(cleanSuggestion('第一行\n第二行'), '第一行 第二行');
  assert.equal(cleanSuggestion('字'.repeat(100), 20)?.length, 20);
});

test('cleanSuggestion：SKIP / 跳过 / 空 都返回 null（不弹气泡）', () => {
  assert.equal(cleanSuggestion('SKIP'), null);
  assert.equal(cleanSuggestion('skip.'), null);
  assert.equal(cleanSuggestion('跳过'), null);
  assert.equal(cleanSuggestion('   '), null);
});

test('clampChars：20–120，非法值回落 40', () => {
  assert.equal(clampChars(5), 20);
  assert.equal(clampChars(999), 120);
  assert.equal(clampChars('abc'), 40);
  assert.equal(clampChars(40), 40);
});
