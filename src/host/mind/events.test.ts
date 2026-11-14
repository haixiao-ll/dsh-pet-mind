import assert from 'node:assert/strict';
import { test } from 'node:test';

import { textOf } from './index.ts';

test('textOf：DSH session.v4 的 data 包装（user 直接 content / assistant 在 message.content）', () => {
  assert.equal(textOf({ type: 'user/message', data: { content: [{ type: 'text', text: '你好' }] } }), '你好');
  assert.equal(
    textOf({
      type: 'assistant/message',
      data: { message: { content: [{ type: 'text', text: '在' }, { type: 'reasoning', text: '思考' }] } },
    }),
    '在',
  );
});

test('textOf：兼容旧的扁平形状，且忽略非 text 块', () => {
  assert.equal(textOf({ message: { content: [{ type: 'text', text: '旧形状' }] } }), '旧形状');
  assert.equal(textOf({ data: { content: [{ type: 'image' }] } }), '');
  assert.equal(textOf({}), '');
});
