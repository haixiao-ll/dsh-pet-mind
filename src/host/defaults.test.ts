/**
 * 出厂默认配置的回归测试：心智层必须"装完即用"，不需要用户手写 `mind` 段。
 * 走完整的 readAllConfig 管线（内置 assets/config.jsonc + 空用户层）。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readAllConfig } from './config.ts';

test('出厂默认：心智层开箱即用（OCR 开启、30 秒/每天 6 条/120 字）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-defaults-'));
  try {
    const cfg = readAllConfig({
      defaultFile: join(process.cwd(), 'assets/config.jsonc'),
      userFile: join(dir, 'main-config.jsonc'),
      legacyUserFile: join(dir, 'main-config.json'),
      petDir: join(dir, 'pet'),
    });
    const mind = cfg.main.mind as {
      enabled?: boolean;
      context?: { windowTokens?: number };
      coach?: { dwellSec?: number; dailyLimit?: number };
      suggestion?: { maxChars?: number };
      vision?: { enabled?: boolean; mode?: string };
    };
    assert.equal(mind.enabled, true);
    assert.equal(mind.vision?.enabled, true, 'OCR 建议应默认开启');
    assert.equal(mind.vision?.mode, 'ocr');
    assert.equal(mind.coach?.dwellSec, 30);
    assert.equal(mind.coach?.dailyLimit, 6);
    assert.equal(mind.suggestion?.maxChars, 120);
    assert.equal(mind.context?.windowTokens, 0, '窗口默认自动识别');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
