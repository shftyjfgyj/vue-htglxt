import { expect, test } from '@playwright/test';

const API = 'http://127.0.0.1:3001';

async function login(username: string, password: string) {
  const res = await fetch(API + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const body = await res.json();
  if (body.code !== 0) throw new Error('登录失败: ' + username + ' ' + body.message);
  return body.data as { accessToken: string; user: { id: number; username: string } };
}

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@123456';

test.describe('自动审核（违禁词 / 信任等级 / 人工兜底）', () => {
  test('可信作者提交后自动发布，新作者转人工', async ({ request }) => {
    const admin = await login('admin', ADMIN_PASSWORD);
    const editor = await login('editor', 'Editor@123456');
    const stamp = Date.now();

    // 用例自带前置条件：清除违规，保证 editor 处于「可信」状态（不依赖执行顺序）
    await request.put(API + '/api/v1/users/' + editor.user.id + '/trust', {
      headers: { Authorization: 'Bearer ' + admin.accessToken },
      data: { resetViolations: true }
    });

    // 可信作者（editor 已发布多篇、无违规）→ 自动发布
    const trusted = await request.post(API + '/api/v1/articles', {
      headers: { Authorization: 'Bearer ' + editor.accessToken },
      data: { title: 'E2E 自动发布 ' + stamp, summary: 'x', content: '<p>完全正常的技术内容</p>', submit: true }
    });
    const trustedBody = await trusted.json();
    expect(trustedBody.data.decision).toBe('pass');
    expect(trustedBody.data.status).toBe(2);

    // 新建一个「零发布」的作者（roleIds 取 editor 角色）→ 转人工
    const rolesRes = await request.get(API + '/api/v1/roles', { headers: { Authorization: 'Bearer ' + admin.accessToken } });
    const roles = (await rolesRes.json()).data as Array<{ id: number; code: string }>;
    const editorRole = roles.find((role) => role.code === 'editor')!;
    const username = 'e2e_author_' + stamp;
    const created = await request.post(API + '/api/v1/users', {
      headers: { Authorization: 'Bearer ' + admin.accessToken },
      data: { username, password: 'E2e@123456', nickname: 'E2E 新作者', roleIds: [editorRole.id] }
    });
    expect((await created.json()).code).toBe(0);

    const fresh = await login(username, 'E2e@123456');
    const pending = await request.post(API + '/api/v1/articles', {
      headers: { Authorization: 'Bearer ' + fresh.accessToken },
      data: { title: 'E2E 新作者 ' + stamp, summary: 'x', content: '<p>新人第一篇正常内容</p>', submit: true }
    });
    const pendingBody = await pending.json();
    expect(pendingBody.data.decision).toBe('review');
    expect(pendingBody.data.status).toBe(1);

    // 清理：删除新作者刚提交的文章与这个临时账号
    await request.delete(API + '/api/v1/articles/' + pendingBody.data.id, { headers: { Authorization: 'Bearer ' + fresh.accessToken } });
    await request.delete(API + '/api/v1/users/' + fresh.user.id, { headers: { Authorization: 'Bearer ' + admin.accessToken } });
    // 顺带清掉可信作者那篇自动发布的测试文章
    await request.delete(API + '/api/v1/articles/' + trustedBody.data.id, { headers: { Authorization: 'Bearer ' + editor.accessToken } });
  });

  test('命中违禁词自动驳回并通知作者', async ({ request }) => {
    const editor = await login('editor', 'Editor@123456');
    const stamp = Date.now();

    const res = await request.post(API + '/api/v1/articles', {
      headers: { Authorization: 'Bearer ' + editor.accessToken },
      data: { title: 'E2E 违禁词 ' + stamp, summary: 'x', content: '<p>本文提供代开发票服务，价格优惠</p>', submit: true }
    });
    const body = await res.json();
    expect(body.data.decision).toBe('reject');
    expect(body.data.status).toBe(3);
    expect(body.data.reason).toContain('代开发票');

    // 作者收到系统通知（含命中词）
    const notifications = await request.get(API + '/api/v1/notifications?page=1&pageSize=10', {
      headers: { Authorization: 'Bearer ' + editor.accessToken }
    });
    const list = (await notifications.json()).data.list as Array<{ title: string; content: string }>;
    expect(list.some((item) => item.title.includes('自动驳回') && item.content.includes('代开发票'))).toBe(true);
  });

  test('评论按同一引擎自动过审：正常通过、命中转人工、违禁拒绝', async ({ request }) => {
    const admin = await login('admin', ADMIN_PASSWORD);
    const editor = await login('editor', 'Editor@123456');
    const stamp = Date.now();

    // 上一个用例会让 editor 记一次违规（这是设计行为），这里先清除，保证评论用例的前置条件
    await request.put(API + '/api/v1/users/' + editor.user.id + '/trust', {
      headers: { Authorization: 'Bearer ' + admin.accessToken },
      data: { resetViolations: true }
    });

    const articleRes = await request.post(API + '/api/v1/articles', {
      headers: { Authorization: 'Bearer ' + editor.accessToken },
      data: { title: 'E2E 评论审核 ' + stamp, summary: 'x', content: '<p>用于评论审核测试</p>', submit: true }
    });
    const articleId = (await articleRes.json()).data.id;

    const clean = await request.post(API + '/api/v1/comments', {
      headers: { Authorization: 'Bearer ' + editor.accessToken },
      data: { articleId, content: '这是一条正常评论' }
    });
    expect((await clean.json()).data.auditStatus).toBe(1);

    const review = await request.post(API + '/api/v1/comments', {
      headers: { Authorization: 'Bearer ' + editor.accessToken },
      data: { articleId, content: '需要的话加微信私聊' }
    });
    expect((await review.json()).data.auditStatus).toBe(0);

    const blocked = await request.post(API + '/api/v1/comments', {
      headers: { Authorization: 'Bearer ' + editor.accessToken },
      data: { articleId, content: '本店提供代开发票' }
    });
    expect((await blocked.json()).data.auditStatus).toBe(2);

    await request.delete(API + '/api/v1/articles/' + articleId, { headers: { Authorization: 'Bearer ' + editor.accessToken } });
  });

  test('内容编辑既看不到违禁词库菜单，直接访问也会被拦到 403', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/editor.json' });
    const page = await ctx.newPage();

    await page.goto('/dashboard');
    await expect(page.locator('.aside-menu')).toBeVisible();
    await expect(page.locator('.aside-menu').getByText('违禁词库')).toHaveCount(0);
    // 但内容编辑保留「全站文章」入口
    await page.locator('.aside-menu').getByText('内容管理').click();
    await expect(page.locator('.aside-menu').getByText('全站文章')).toBeVisible();

    await page.goto('/system/sensitive-words');
    await expect(page.getByText('403')).toBeVisible();
    await ctx.close();
  });
});

test.describe('违禁词库（管理员）', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('词库页面可增删改查与命中测试', async ({ page }) => {
    await page.goto('/system/sensitive-words');
    await expect(page.getByRole('heading', { name: '违禁词库' })).toBeVisible();
    await expect(page.getByText('自动驳回词')).toBeVisible();

    // 命中测试：一段含违禁词的文字应判定为自动驳回
    await page.getByRole('button', { name: '命中测试' }).click();
    await page.getByPlaceholder('粘贴一段文章或评论内容，看看会自动审核成什么结果').fill('加我微信，可以提供代开发票');
    await page.getByRole('button', { name: '测试一下' }).click();
    await expect(page.getByText(/会被自动驳回/)).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/代开发票/).first()).toBeVisible();
    await page.keyboard.press('Escape');

    // 新增一个词条并删除
    const word = 'E2E敏感词' + Date.now();
    await page.getByRole('button', { name: '新增词条' }).click();
    await page.getByPlaceholder('要拦截的词，例如：加微信').fill(word);
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('已加入词库，立即生效')).toBeVisible();
    const row = page.getByRole('row', { name: new RegExp(word) });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '删除' }).click();
    await page.getByRole('button', { name: '确定' }).click();
    await expect(page.getByText('已删除')).toBeVisible();
  });

});