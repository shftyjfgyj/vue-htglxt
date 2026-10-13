// 阅读页底部与深色正文的可读性验证
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const APP = 'http://127.0.0.1:8080';
const API = 'http://127.0.0.1:3001';
const outDir = path.resolve('ui-shots', 'reader-bottom');
fs.mkdirSync(outDir, { recursive: true });

async function loginToken() {
  const res = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'editor', password: 'Editor@123456' }) });
  return (await res.json()).data;
}
const auth = await loginToken();
const persisted = JSON.stringify({ accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user });
const list = await (await fetch(API + '/api/v1/articles?status=2&page=1&pageSize=1', { headers: { Authorization: 'Bearer ' + auth.accessToken } })).json();
const articleId = list.data.list[0].id;

const browser = await chromium.launch({ channel: 'msedge' });
for (const theme of ['light', 'dark']) {
  const state = { cookies: [], origins: [{ origin: APP, localStorage: [{ name: 'htglxt.auth', value: persisted }, { name: 'htglxt.theme', value: theme }] }] };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
  const page = await ctx.newPage();
  await page.goto(APP + '/content/articles/' + articleId + '/view');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(outDir, 'top-' + theme + '.png') });
  // 滚到底部，检查作者卡 / 声明 / 回到顶部
  await page.locator('.admin-main').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, 'bottom-' + theme + '.png') });
  await ctx.close();
}
await browser.close();
console.log('已保存:', outDir);