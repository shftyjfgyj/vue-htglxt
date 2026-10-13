import { expect, test } from '@playwright/test';

test.describe('文章全链路（M3 审核 + M5 评论/通知）', () => {
  // 默认使用 editor 的登录态（由 global-setup 通过 API 登录后写入）
  test.use({ storageState: 'e2e/.auth/editor.json' });

  test('写文章 -> 提交审核 -> 管理员审核发布 -> 阅读评论 -> 作者收到通知', async ({ page, browser, request }) => {
    const title = 'E2E 文章 ' + Date.now();
    const content = '这是端到端测试正文，关键词 性能优化。';

    // 1) 写文章并提交审核
    await page.goto('/content/articles/new');
    await page.getByPlaceholder('请输入标题').fill(title);
    await page.getByPlaceholder('选填，用于列表展示').fill('E2E 摘要');
    await page.locator('.ql-editor').click();
    await page.locator('.ql-editor').fill(content);
    await page.getByRole('button', { name: '保存并提交审核' }).click();
    // 自动审核：editor 已是可信作者且正文无违禁词 → 直接发布，不再排队等人工
    await expect(page.getByText('未命中违禁词，已自动发布上线')).toBeVisible({ timeout: 15_000 });

    // 2) 列表页状态为「已发布」（系统自动审核通过）
    await page.goto('/content/articles');
    const row = page.getByRole('row', { name: new RegExp(title) });
    await expect(row).toBeVisible();
    await expect(row.getByText('已发布')).toBeVisible();

    // 3) 管理员在独立上下文中能看到这篇文章（无需再人工审核）
    const adminContext = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/content/articles');
    await adminPage.getByPlaceholder('标题 / 摘要 / 正文').fill(title);
    await adminPage.getByRole('button', { name: '查询' }).click();
    const adminRow = adminPage.getByRole('row', { name: new RegExp(title) });
    await expect(adminRow).toBeVisible();
    await expect(adminRow.getByText('已发布')).toBeVisible();
    await adminContext.close();

    // 4) 作者侧进入阅读页
    await page.goto('/content/articles');
    await page.getByPlaceholder('标题 / 摘要 / 正文').fill(title);
    await page.getByRole('button', { name: '查询' }).click();
    const editorRow = page.getByRole('row', { name: new RegExp(title) });
    await expect(editorRow.getByText('已发布')).toBeVisible();
    await editorRow.getByRole('button', { name: '阅读' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(content)).toBeVisible();

    // 5) 发表评论与楼中楼回复
    await page.getByPlaceholder('友善发言，理性讨论').fill('E2E 顶层评论');
    await page.getByRole('button', { name: '发表' }).click();
    await expect(page.getByText('评论已发表')).toBeVisible();
    await expect(page.getByText('E2E 顶层评论')).toBeVisible();
    await page.getByRole('button', { name: '回复' }).first().click();
    await page.getByPlaceholder(/回复 @/).fill('E2E 楼中楼回复');
    await page.getByRole('button', { name: '发表' }).click();
    await expect(page.getByText('回复已发表')).toBeVisible();
    await expect(page.getByText('E2E 楼中楼回复')).toBeVisible();

    // 6) 点赞
    await page.getByRole('button', { name: /点赞/ }).click();
    await expect(page.getByRole('button', { name: /已点赞/ })).toBeVisible();

    // 7) 换一个用户评论，作者才会收到通知（自己评论自己不产生通知）
    const fs = await import('node:fs');
    const adminState = JSON.parse(fs.readFileSync('e2e/.auth/admin.json', 'utf8'));
    const adminToken = JSON.parse(adminState.origins[0].localStorage[0].value).accessToken as string;
    const articleId = Number(page.url().match(/articles\/(\d+)/)?.[1]);
    await request.post('http://127.0.0.1:3001/api/v1/comments', {
      headers: { Authorization: 'Bearer ' + adminToken },
      data: { articleId, content: '管理员路过：写得不错' }
    });

    await page.reload();
    await page.locator('.notify-bell').click();
    await expect(page.getByText(/评论了你的文章/).first()).toBeVisible();
    await page.getByRole('button', { name: '全部已读' }).click();
    await expect(page.getByText(/未读 0/)).toBeVisible();
  });

  test('列表页支持中文全文检索与批量选择', async ({ page }) => {
    await page.goto('/content/articles');
    await page.getByPlaceholder('标题 / 摘要 / 正文').fill('管理');
    await page.getByText('全文检索').click();
    await page.getByRole('button', { name: '查询' }).click();

    // 全文检索「管理」应命中多篇（seed 演示文章 + 历史用例数据），取第一行做批量选择
    const firstRow = page.locator('.el-table__body tr').first();
    await expect(firstRow).toBeVisible();
    await expect(page.getByText(/共 [1-9]\d* 条/)).toBeVisible();
    // Element Plus 的原生 checkbox 被隐藏，点击其可见外壳
    await firstRow.locator('.el-checkbox').first().click();
    await expect(page.getByText(/仅显示已选（1）/)).toBeVisible();
  });
});

test.describe('系统管理（管理员）', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('用户列表、角色权限与日志页面可用', async ({ page }) => {
    await page.goto('/system/users');
    await expect(page.getByRole('row', { name: /admin@example\.com/ }).first()).toBeVisible();

    await page.goto('/system/roles');
    await expect(page.getByRole('row', { name: /超级管理员/ })).toBeVisible();
    await page.getByRole('row', { name: /内容编辑/ }).getByRole('button', { name: '分配权限' }).click();
    await expect(page.getByText('分配权限 - 内容编辑')).toBeVisible();
    await expect(page.getByText('article:audit')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();

    await page.goto('/system/logs/operation');
    await expect(page.getByRole('row', { name: /article/ }).first()).toBeVisible();
    await page.goto('/system/logs/login');
    await expect(page.getByRole('row', { name: /admin/ }).first()).toBeVisible();
  });

  test('内容管理页（分类/标签/评论）可用', async ({ page }) => {
    await page.goto('/content/categories');
    await expect(page.getByRole('row', { name: /技术分享/ }).first()).toBeVisible();

    await page.goto('/content/tags');
    await expect(page.getByText('热门标签 Top 10（按被引用次数，服务端排序）')).toBeVisible();

    await page.goto('/content/comments');
    await expect(page.getByText('回复关系')).toBeVisible();
    // 回复行展示被回复内容摘要，而不是只给一个 #id
    await expect(page.getByText('顶层评论').first()).toBeVisible();
  });
});