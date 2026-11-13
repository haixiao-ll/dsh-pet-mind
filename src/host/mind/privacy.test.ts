import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkPrivacy, cloudAllowed, isSelfWindow, normalizeApp } from './privacy.ts';

test('normalizeApp：去目录、去 .exe、转小写', () => {
  assert.equal(normalizeApp('C:\\Program Files\\WeChat\\WeChat.exe'), 'wechat');
  assert.equal(normalizeApp('Code'), 'code');
  assert.equal(normalizeApp(undefined), '');
});

test('敏感应用：微信/支付宝/密码管理器/远程桌面一律不采集', () => {
  for (const app of ['WeChat.exe', 'alipay', '1Password.exe', 'mstsc', 'ToDesk']) {
    const d = checkPrivacy({ app, title: '随便什么标题' });
    assert.equal(d.capture, false, `${app} 应该被拦`);
    assert.equal(d.reason, 'sensitive-app');
  }
});

test('标题兜底：应用名认不出，但标题写着"转账/验证码"也拦', () => {
  const d = checkPrivacy({ app: 'somebankclient', title: '个人网银 - 转账汇款' });
  assert.equal(d.capture, false);
  // 命中的可能是 app 片段或标题规则，两种都算对
  assert.ok(d.reason === 'sensitive-app' || d.reason === 'sensitive-title');
  const d2 = checkPrivacy({ app: 'unknownapp', title: '请输入短信验证码' });
  assert.equal(d2.capture, false);
});

test('默认拒绝：识别不出前台应用时不采集（fail-closed）', () => {
  assert.equal(checkPrivacy({ app: '', title: '' }).reason, 'unknown-app');
  assert.equal(checkPrivacy({ app: '', title: '' }).capture, false);
  // 用户显式关掉 fail-closed 才放行
  assert.equal(checkPrivacy({ app: '', title: '' }, { unknownIsSensitive: false }).capture, true);
});

test('普通编辑器 / 浏览器：允许采集', () => {
  const d = checkPrivacy({ app: 'Code.exe', title: 'main.ts - dsh-pet - Visual Studio Code' });
  assert.equal(d.capture, true);
  assert.equal(d.reason, 'ok');
});

test('暂停开关优先级最高；用户自定义名单生效', () => {
  assert.equal(checkPrivacy({ app: 'Code.exe', title: '' }, { paused: true }).reason, 'paused');
  const d = checkPrivacy({ app: 'mysecrets.exe', title: '' }, { apps: ['mysecrets'] });
  assert.equal(d.capture, false);
});

test('云端白名单：只有显式写下的应用才可能出本机', () => {
  assert.equal(cloudAllowed('Code.exe', {}), false);
  assert.equal(cloudAllowed('Code.exe', { cloudAllowlist: ['code'] }), true);
  assert.equal(cloudAllowed('', { cloudAllowlist: ['code'] }), false);
});

test('桌宠自己的窗口不算"用户停留的应用"', () => {
  assert.equal(isSelfWindow('electron', 'dsh-pet 桌宠（桌面模式）'), true);
  assert.equal(isSelfWindow('electron', 'main.ts - my-project - Visual Studio Code'), false);
  assert.equal(isSelfWindow('Code', 'main.ts - dsh-pet'), true);
  assert.equal(isSelfWindow(undefined, undefined), false);
});
