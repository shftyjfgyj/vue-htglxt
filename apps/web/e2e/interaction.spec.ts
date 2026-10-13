import { expect, test } from '@playwright/test';

test.describe('互动增强（收藏 / 我的收藏 / 评论定位）', () => {
  test.use({ storageState: 'e2e/.auth/editor.json' });

  test('阅读页可收藏，并在「我的收藏」中查看与取消', async ({ page }) => {
    await page.goto('/content/articles');
    const row = page.getByRole('row', { name: /已发布/ }).first();
    const title = (await row.locator('.cell-title').innerText()).trim();
    await row.getByRole('button', { name: '阅读' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    // 统一先取消再收藏，确保最终状态为「已收藏」
    const favorited = page.getByRole('button', { name: /已收藏/ });
    if (await favorited.count()) {
      await favorited.first().click();
      await expect(page.getByRole('button', { name: /^收藏 · / })).toBeVisible();
    }
    await page.getByRole('button', { name: /^收藏 · / }).click();
    await expect(page.getByRole('button', { name: /已收藏/ })).toBeVisible();

    // 我的收藏列表里应能搜到
    await page.goto('/profile/library');
    await expect(page.getByRole('heading', { name: '我的内容库' })).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();

    // 取消收藏后列表不再包含它
    await page.getByRole('button', { name: '取消收藏' }).first().click();
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test('「我的点赞」标签页可用', async ({ page }) => {
    await page.goto('/profile/library');
    await page.locator('.el-radio-button', { hasText: '我的点赞' }).click();
    await expect(page.getByRole('columnheader', { name: '点赞时间' })).toBeVisible();
  });

  test('评论管理可跳转文章并定位到该评论', async ({ browser }) => {
    // 全站评论仅管理员可见，这里用管理员上下文
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await ctx.newPage();
    await page.goto('/content/comments');
    // 只看已通过的评论，保证阅读页能渲染出来
    await page.getByPlaceholder('评论内容关键词').fill('E2E');
    await page.locator('.el-select').first().click();
    await page.getByRole('option', { name: '已通过' }).click();
    await page.getByRole('button', { name: '查询' }).click();

    const row = page.getByRole('row', { name: /顶层评论/ }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '查看' }).click();

    await expect(page).toHaveURL(/\/content\/articles\/\d+\/view#comment-\d+/);
    const target = page.locator('[id^="comment-"]').first();
    await expect(target).toBeVisible();
    await ctx.close();
  });

  test('阅读页展示目录与相关文章', async ({ page }) => {
    await page.goto('/content/articles');
    await page.getByPlaceholder('标题 / 摘要 / 正文').fill('使用指南');
    await page.getByRole('button', { name: '查询' }).click();
    await page.getByRole('row', { name: /使用指南/ }).getByRole('button', { name: '阅读' }).click();

    await expect(page.getByText('本文目录')).toBeVisible();
    // 目录项与正文标题同名，分别断言以避免严格模式冲突
    await expect(page.locator('.toc-list li').first()).toHaveText('一、权限与角色');
    await expect(page.getByRole('heading', { name: '一、权限与角色' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '相关文章' })).toBeVisible();
    await expect(page.getByRole('button', { name: '复制链接' })).toBeVisible();
  });
});

test.describe('M9 阅读与订阅', () => {
  test.use({ storageState: 'e2e/.auth/editor.json' });

  test('看过的文章进入「最近在看」', async ({ page }) => {
    await page.goto('/content/articles');
    const row = page.getByRole('row', { name: /使用指南/ }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '阅读' }).click();
    await expect(page.getByRole('heading', { name: /使用指南/ })).toBeVisible();

    await page.goto('/profile/library');
    await page.locator('.el-radio-button', { hasText: '最近在看' }).click();
    await expect(page.getByRole('columnheader', { name: '最近阅读' })).toBeVisible();
    await expect(page.getByText(/使用指南/).first()).toBeVisible();
  });

  test('收藏可移动到自定义分组并按分组筛选', async ({ page, request }) => {
    const fs = await import('node:fs');
    const readToken = (name: string) => {
      const state = JSON.parse(fs.readFileSync('e2e/.auth/' + name + '.json', 'utf8'));
      return JSON.parse(state.origins[0].localStorage[0].value).accessToken as string;
    };
    const api = 'http://127.0.0.1:3001';

    // 先确保有收藏（上个用例会取消收藏）
    await page.goto('/content/articles');
    await page.getByPlaceholder('标题 / 摘要 / 正文').fill('使用指南');
    await page.getByRole('button', { name: '查询' }).click();
    await page.getByRole('row', { name: /使用指南/ }).getByRole('button', { name: '阅读' }).click();
    await expect(page.getByRole('heading', { name: /使用指南/ })).toBeVisible();

    const articleId = Number(page.url().match(/articles\/(\d+)/)?.[1]);
    const favButton = page.getByRole('button', { name: /^收藏 · / });
    const favDone = page.getByRole('button', { name: /已收藏/ });
    await expect(favButton.or(favDone)).toBeVisible();
    if (await favButton.count()) await favButton.click();
    await expect(favDone).toBeVisible();

    // 用接口把这条收藏放进目标分组，保证下拉里一定有该分组（避免 allow-create 的不确定性）
    await request.put(api + '/api/v1/me/favorites/' + articleId + '/folder', {
      headers: { Authorization: 'Bearer ' + readToken('editor') },
      data: { folder: '学习资料' }
    });

    // 界面上再移动一次到「默认分组」，验证交互链路
    await page.goto('/profile/library');
    const row = page.getByRole('row', { name: /使用指南/ }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '移动分组' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.locator('.el-select').click();
    await page.getByRole('option', { name: '默认分组' }).click();
    await dialog.getByRole('button', { name: '确定' }).click();

    await expect(page.getByText(/已移动到「默认分组」/)).toBeVisible();

    // 空分组会从筛选条消失，因此移动后应看到「默认分组」这条分组
    const chip = page.locator('.folder-chip', { hasText: '默认分组' });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page.getByRole('row', { name: /使用指南/ }).first()).toBeVisible();
  });
});

test.describe('M9 关注动态（viewer）', () => {
  test.use({ storageState: 'e2e/.auth/viewer.json' });

  test('关注作者后可在关注动态看到其文章', async ({ page, request }) => {
    const fs = await import('node:fs');
    const readToken = (name: string) => {
      const state = JSON.parse(fs.readFileSync('e2e/.auth/' + name + '.json', 'utf8'));
      return JSON.parse(state.origins[0].localStorage[0].value).accessToken as string;
    };
    const api = 'http://127.0.0.1:3001';

    // 拿到 editor 的用户 id 并让 viewer 关注他
    const profileRes = await request.get(api + '/api/v1/auth/profile', { headers: { Authorization: 'Bearer ' + readToken('editor') } });
    const editorId = (await profileRes.json()).data.id;
    await request.post(api + '/api/v1/users/' + editorId + '/follow', {
      headers: { Authorization: 'Bearer ' + readToken('viewer') }
    });

    await page.goto('/content/feed');
    await expect(page.getByRole('heading', { name: '关注动态' })).toBeVisible();
    await expect(page.locator('.feed-item').first()).toBeVisible();
    await expect(page.locator('.feed-item').first()).toContainText('内容编辑');

    // 点击动态进入阅读页
    await page.locator('.feed-item').first().click();
    await expect(page).toHaveURL(/\/content\/articles\/\d+\/view/);
  });
});
test.describe('评论权限收敛（管理员看全部 / 其他人只管自己）', () => {
  test('编辑在「我的评论」只看得到自己的评论', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/editor.json' });
    const page = await ctx.newPage();
    await page.goto('/content/my-comments');
    await expect(page.getByRole('heading', { name: '我的评论' })).toBeVisible();
    const rows = page.locator('.el-table__body tr');
    await expect(rows.first()).toBeVisible();
    // 每一行的评论人都是自己（页面本身不显示评论人列，改为校验接口返回的都是本人）
    const mine = await page.evaluate(async () => {
      const raw = localStorage.getItem('htglxt.auth');
      const token = raw ? JSON.parse(raw).accessToken : '';
      const res = await fetch('/api/v1/comments?page=1&pageSize=50', { headers: { Authorization: 'Bearer ' + token } });
      const body = await res.json();
      return [...new Set((body.data.list as Array<{ userId: number }>).map((item) => item.userId))];
    });
    expect(mine.length).toBe(1);

    // 编辑看不到全站评论菜单，直接访问也是 403
    await page.goto('/dashboard');
    await page.locator('.aside-menu').getByText('内容管理').click();
    await expect(page.locator('.aside-menu').getByText('我的评论')).toBeVisible();
    await expect(page.locator('.aside-menu').getByText('全站评论')).toHaveCount(0);
    await page.goto('/content/comments');
    await expect(page.getByText('403')).toBeVisible();
    await ctx.close();
  });

  test('管理员可看全站评论并查看审核记录', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await ctx.newPage();
    await page.goto('/content/comments');
    await expect(page.getByRole('columnheader', { name: '机器判定' })).toBeVisible();
    await page.getByRole('button', { name: '审核记录' }).first().click();
    await expect(page.getByText('审核记录').last()).toBeVisible();
    await expect(page.locator('.el-drawer').getByText(/系统自动判定|人工审核/).first()).toBeVisible();
    await page.keyboard.press('Escape');

    // 全站评论能看到不同作者的评论
    const authors = await page.evaluate(async () => {
      const raw = localStorage.getItem('htglxt.auth');
      const token = raw ? JSON.parse(raw).accessToken : '';
      const res = await fetch('/api/v1/comments?page=1&pageSize=50', { headers: { Authorization: 'Bearer ' + token } });
      const body = await res.json();
      return [...new Set((body.data.list as Array<{ userId: number }>).map((item) => item.userId))];
    });
    expect(authors.length).toBeGreaterThan(1);
    await ctx.close();
  });
});
