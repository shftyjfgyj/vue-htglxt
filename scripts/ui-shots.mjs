// UI 截图脚本：用于改版前后对比
// 用法: node scripts/ui-shots.mjs <label> [username] [password] [theme=light|dark] [mobile]
//   mobile: 以 420x860 手机视口截图，并额外截一张「打开抽屉菜单」的效果图
//   默认使用 editor / Editor@123456（admin 密码可能已被改过）
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const label = process.argv[2] || 'shot';
const username = process.argv[3] || 'editor';
const password = process.argv[4] || 'Editor@123456';
const theme = (process.argv[5] || 'light') === 'dark' ? 'dark' : 'light';
const mobile = process.argv[6] === 'mobile';
const viewport = mobile ? { width: 420, height: 860 } : { width: 1440, height: 900 };
const APP = 'http://127.0.0.1:8080';
const API = 'http://127.0.0.1:3001';
const outDir = path.resolve('ui-shots', label);
fs.mkdirSync(outDir, { recursive: true });

// 优先复用 E2E 保存的登录态（避免频繁登录触发限流）；没有再走 API 登录
const authFile = path.resolve('apps/web/e2e/.auth', username + '.json');
let authPayload = null;
if (fs.existsSync(authFile)) {
  try {
    const saved = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    const entry = saved.origins?.[0]?.localStorage?.find((item) => item.name === 'htglxt.auth');
    if (entry) {
      authPayload = JSON.parse(entry.value);
      console.log('复用已保存的登录态: ' + authFile);
    }
  } catch {
    authPayload = null;
  }
}

// 校验复用的 token 是否还有效（access token 只有 15 分钟；App 会自动刷新，脚本这边直接重新登录）
if (authPayload) {
  const probe = await fetch(API + '/api/v1/auth/profile', { headers: { Authorization: 'Bearer ' + authPayload.accessToken } });
  if (!probe.ok) {
    console.log('已保存的登录态已失效，改为重新登录');
    authPayload = null;
  }
}

if (!authPayload) {
  const loginRes = await fetch(API + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const loginBody = await loginRes.json();
  if (loginRes.status !== 200) {
    console.error('登录失败: HTTP ' + loginRes.status + ' ' + JSON.stringify(loginBody));
    process.exit(1);
  }
  authPayload = loginBody.data;
  console.log('通过 API 登录: ' + username);
}
const user = authPayload.user;
console.log('登录成功: ' + user.username + '（权限 ' + user.permissions.length + ' 个，主题 ' + theme + '）');
const can = (code) => user.permissions.includes('*') || user.permissions.includes(code);
const persisted = JSON.stringify({ accessToken: authPayload.accessToken, refreshToken: authPayload.refreshToken, user });
const storageEntries = [
  { name: 'htglxt.auth', value: persisted },
  { name: 'htglxt.theme', value: theme }
];
const state = { cookies: [], origins: [{ origin: APP, localStorage: storageEntries }] };

const browser = await chromium.launch({ channel: 'msedge' });

// 1) 登录页（未登录）
const anon = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
const anonPage = await anon.newPage();
await anonPage.goto(APP + '/login');
await anonPage.waitForTimeout(900);
await anonPage.screenshot({ path: path.join(outDir, '01-login.png') });
await anon.close();

// 2) 已登录页面（按权限过滤）
const ctx = await browser.newContext({ viewport, storageState: state });
const page = await ctx.newPage();

const targets = [
  ['02-dashboard', '/dashboard', null],
  ['03-articles', '/content/articles', 'article:list'],
  ['04-categories', '/content/categories', 'category:list'],
  ['05-tags', '/content/tags', 'tag:list'],
  ['06-comments', '/content/comments', 'comment:list'],
  ['07-users', '/system/users', 'user:list'],
  ['08-roles', '/system/roles', 'role:list'],
  ['09-profile', '/profile', null],
  ['14-feed', '/content/feed', null],
  ['15-my-articles', '/content/my-articles', null],
  ['16-sensitive-words', '/system/sensitive-words', 'sensitive:list'],
  ['17-my-comments', '/content/my-comments', null],
];
for (const [name, url, permission] of targets) {
  if (permission && !can(permission)) { console.log('跳过 ' + url + '（无 ' + permission + ' 权限）'); continue; }
  await page.goto(APP + url);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(outDir, name + '.png') });
}

// 3) 写文章页（编辑器）
await page.goto(APP + '/content/articles/new');
await page.waitForTimeout(1400);
await page.screenshot({ path: path.join(outDir, '12-editor.png') });

// 4) 移动端：打开抽屉菜单
if (mobile) {
  await page.goto(APP + '/dashboard');
  await page.waitForTimeout(900);
  await page.locator('.icon-btn').first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, '02b-mobile-drawer.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// 4.05) 我的收藏页
await page.goto(APP + '/profile/library');
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(outDir, '13-library.png') });

// 4.1) 角色权限弹窗（仅管理员）
if (can('role:assignPerm')) {
  await page.goto(APP + '/system/roles');
  await page.waitForTimeout(1000);
  const permBtn = page.getByRole('row', { name: /内容编辑/ }).getByRole('button', { name: '分配权限' });
  if (await permBtn.count()) {
    await permBtn.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(outDir, '08b-role-perms.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

// 5) 弹窗形态（新建用户 / 分配权限）——只在有权限时截图
if (can('user:create')) {
  await page.goto(APP + '/system/users');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: '新建用户' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, '10-dialog.png') });
  await page.keyboard.press('Escape');
}

// 4) 阅读页（取一篇已发布文章）
const listRes = await fetch(API + '/api/v1/articles?page=1&pageSize=1&status=2', { headers: { Authorization: 'Bearer ' + authPayload.accessToken } });
const list = await listRes.json();
if (list.data && list.data.list.length > 0) {
  await page.goto(APP + '/content/articles/' + list.data.list[0].id + '/view');
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(outDir, '11-reader.png') });
}

await ctx.close();
await browser.close();
console.log('截图已保存到 ' + outDir);