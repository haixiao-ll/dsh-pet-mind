import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeOcrText, ocrDataUrl } from './ocr.ts';

test('OCR 规整：汉字之间的空格要合并，英文单词之间保留', () => {
  assert.equal(normalizeOcrText('测 试 文 本 ： 请 把 这 段 代 码 的 报 错 告 诉 我'), '测试文本：请把这段代码的报错告诉我');
  assert.equal(normalizeOcrText('hello world 你 好'), 'hello world 你好');
});

test('OCR 规整：折行与连续空白压成一个空格，超长截断', () => {
  assert.equal(normalizeOcrText('第一行\n第二行\t\t第三行'), '第一行 第二行 第三行');
  const long = '字'.repeat(50);
  assert.equal(normalizeOcrText(long, 10).length, 10);
});

test('非 Windows / 非法 data URL 直接失败（不 spawn 进程）', async () => {
  const bad = await ocrDataUrl('data:image/gif;base64,AAAA');
  assert.equal(bad.ok, false);
  assert.equal((bad as { reason: string }).reason, 'bad-image');
});

test('注入执行器：正常文本 / 引擎缺失 / 空文本', async () => {
  const okRun = async () => '你 好 世 界';
  const ok = await ocrDataUrl('data:image/jpeg;base64,AAAA', { run: okRun });
  assert.deepEqual(ok, { ok: true, text: '你好世界' });

  const noEngine = await ocrDataUrl('data:image/jpeg;base64,AAAA', { run: async () => 'NO_ENGINE' });
  assert.deepEqual(noEngine, { ok: false, reason: 'no-engine' });

  const empty = await ocrDataUrl('data:image/jpeg;base64,AAAA', { run: async () => '   ' });
  assert.equal(empty.ok, false);
  assert.equal((empty as { reason: string }).reason, 'empty');
});

test('注入执行器抛错 → 收敛成 failed/timeout', async () => {
  const failed = await ocrDataUrl('data:image/jpeg;base64,AAAA', {
    run: async () => {
      throw new Error('ocr-exit-1');
    },
  });
  assert.deepEqual(failed, { ok: false, reason: 'failed' });

  const timeout = await ocrDataUrl('data:image/jpeg;base64,AAAA', {
    run: async () => {
      throw new Error('ocr-timeout');
    },
  });
  assert.deepEqual(timeout, { ok: false, reason: 'timeout' });
});
