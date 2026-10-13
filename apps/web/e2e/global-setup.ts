import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from '@playwright/test';

const API = 'http://127.0.0.1:3001';
const APP_ORIGIN = 'http://127.0.0.1:4173';
const STORAGE_KEY = 'htglxt.auth';

const ACCOUNTS = {
  // admin 口令可能已被修改，支持环境变量覆盖：$env:E2E_ADMIN_PASSWORD='新密码'
  admin: { username: process.env.E2E_ADMIN_USER || 'admin', password: process.env.E2E_ADMIN_PASSWORD || 'Admin@123456' },
  editor: { username: 'editor', password: 'Editor@123456' },
  viewer: { username: 'viewer', password: 'Viewer@123456' }
};

/**
 * 全局准备：用 API 登录一次并写入 storageState。
 * 这样绝大多数用例直接复用登录态，既快又不会把登录限流额度耗光
 * （之前每跑一次 E2E 都会触发 20 次/10 分钟的登录限流，全部用例集体失败）。
 */
export default async function globalSetup(): Promise<void> {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth');
  fs.mkdirSync(dir, { recursive: true });

  const context = await request.newContext();
  const tokens: Record<string, { accessToken: string; user: { id: number } }> = {};
  try {
    for (const [name, credentials] of Object.entries(ACCOUNTS)) {
      const response = await context.post(API + '/api/v1/auth/login', { data: credentials });
      if (!response.ok()) {
        // admin 口令可能已被使用者修改：不阻塞整条套件，写入空状态并给出提示
        console.warn(
          '[E2E] 账号 ' + name + ' 登录失败（HTTP ' + response.status() + '），其相关用例将以未登录状态运行。' +
            ' 可用 $env:E2E_ADMIN_PASSWORD=\'新密码\' 覆盖。'
        );
        fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify({ cookies: [], origins: [] }, null, 2));
        continue;
      }
      const body = await response.json();
      tokens[name] = { accessToken: body.data.accessToken, user: body.data.user };
      const persisted = JSON.stringify({
        accessToken: body.data.accessToken,
        refreshToken: body.data.refreshToken,
        user: body.data.user
      });
      const state = {
        cookies: [],
        origins: [{ origin: APP_ORIGIN, localStorage: [{ name: STORAGE_KEY, value: persisted }] }]
      };
      fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(state, null, 2));
    }

    // 自动审核用例依赖「editor 是可信作者」这一前置条件：
    // 每次跑套件前清除它的违规记录，避免上一次跑出的违规把后续用例带偏。
    if (tokens.admin && tokens.editor) {
      const reset = await context.put(API + '/api/v1/users/' + tokens.editor.user.id + '/trust', {
        headers: { Authorization: 'Bearer ' + tokens.admin.accessToken },
        data: { resetViolations: true }
      });
      if (reset.ok()) {
        console.log('[E2E] 已重置 editor 的违规记录（保证自动审核用例的信任前置条件）');
      }
    }
  } finally {
    await context.dispose();
  }
}