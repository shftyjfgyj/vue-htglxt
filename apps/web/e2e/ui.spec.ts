import { expect, test } from '@playwright/test';

test.describe('UI 能力（深色模式 / 列宽记忆）', () => {
  test.use({ storageState: 'e2e/.auth/editor.json' });

  test('深色模式可切换、刷新后保持', async ({ page }) => {
    await page.goto('/dashboard');
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);

    await page.locator('.icon-btn[title*="深色"]').click();
    await expect(html).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem('htglxt.theme'))).toBe('dark');

    // 刷新后仍为深色（首屏即应用，不闪白）
    await page.reload();
    await expect(html).toHaveClass(/dark/);
    // 深色下正文与卡片保持可读（背景确实变暗）
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(246, 248, 252)');

    await page.locator('.icon-btn[title*="浅色"]').click();
    await expect(html).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem('htglxt.theme'))).toBe('light');
  });

  test('拖拽列宽后刷新仍然保持，并可一键重置', async ({ page }) => {
    await page.goto('/content/articles');
    await expect(page.locator('.el-table__body tr').first()).toBeVisible();

    const header = () => page.locator('.el-table__header th').filter({ hasText: '作者' }).first();
    await expect(header()).toBeVisible();
    const box = (await header().boundingBox())!;
    expect(box.width).toBeGreaterThan(0);

    // 表头右边缘 8px 是拖拽命中区；拖拽本身有时序抖动，失败重试
    let stored: string | null = null;
    for (let attempt = 0; attempt < 3 && !stored; attempt += 1) {
      const current = (await header().boundingBox())!;
      await page.mouse.move(current.x + current.width - 2, current.y + current.height / 2);
      await page.mouse.down();
      await page.mouse.move(current.x + current.width + 64, current.y + current.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(350);
      stored = await page.evaluate(() => localStorage.getItem('htglxt.table-cols.articles'));
    }
    expect(stored).toContain('作者');

    // 刷新后列宽仍然生效
    await page.reload();
    await expect(page.locator('.el-table__body tr').first()).toBeVisible();
    const after = await header().boundingBox();
    expect(after!.width).toBeGreaterThan(box.width + 30);

    // 重置按钮出现并可恢复默认
    const reset = page.getByRole('button', { name: '重置列宽' });
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(page.getByRole('button', { name: '重置列宽' })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('htglxt.table-cols.articles'))).toBeNull();
  });
});

test.describe('M6+ 新增能力（PDF 报表 / 筛选记忆 / 移动端）', () => {
  test.use({ storageState: 'e2e/.auth/editor.json' });

  test('可导出 PDF 数据报表', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: '导出 PDF 报表' })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出 PDF 报表' }).click()
    ]);
    expect(download.suggestedFilename()).toMatch(/^htglxt-report-\d{4}-\d{2}-\d{2}\.pdf$/);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const { readFileSync } = await import('node:fs');
    const head = readFileSync(filePath!).subarray(0, 5).toString('latin1');
    expect(head).toBe('%PDF-');
  });

  test('看板趋势图为 ECharts 渲染且含三个维度', async ({ page }) => {
    await page.goto('/dashboard');
    const canvas = page.locator('.trend-chart canvas');
    await expect(canvas).toBeVisible();
    await expect(page.getByText('近 7 天多维趋势')).toBeVisible();

    // ECharts 把图例/坐标轴画在 canvas 上，因此断言「画布尺寸非零 + 实例已挂载」
    await expect(page.locator('.trend-chart')).toHaveAttribute('_echarts_instance_', /.+/);
    const box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(120);

    // 三个维度的统计文案（发文 / 评论 / 登录）在卡片头部可读
    await expect(page.getByText(/发文 \d+ · 评论 \d+ · 登录 \d+/)).toBeVisible();
  });

  test('列表筛选条件在切页返回后自动恢复', async ({ page }) => {
    await page.goto('/content/articles');
    const keyword = page.getByPlaceholder('标题 / 摘要 / 正文');
    await keyword.fill('E2E');
    await page.getByRole('button', { name: '查询' }).click();

    // 切走再回来（同一标签页，sessionStorage 生效）
    await page.goto('/dashboard');
    await page.goto('/content/articles');

    await expect(page.getByPlaceholder('标题 / 摘要 / 正文')).toHaveValue('E2E');
    await expect(page.getByText('已恢复上次筛选')).toBeVisible();
  });

  test('移动端视口下侧栏收进抽屉', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 860 });
    await page.goto('/dashboard');

    // 桌面侧栏不存在，顶部显示当前页标题
    await expect(page.locator('.admin-aside')).toHaveCount(0);
    await expect(page.getByText('数据看板').first()).toBeVisible();

    // 点击汉堡按钮打开抽屉菜单
    await page.locator('.icon-btn').first().click();
    await expect(page.locator('.el-drawer')).toBeVisible();
    await expect(page.locator('.el-drawer').getByText('内容管理')).toBeVisible();

    // 展开分组后点击子菜单，抽屉应自动关闭
    await page.locator('.el-drawer').getByText('内容管理').click();
    await expect(page.locator('.el-drawer').getByText('全站文章')).toBeVisible();
    await page.locator('.el-drawer').getByText('全站文章').click();
    await expect(page).toHaveURL(/\/content\/articles/);
    await expect(page.locator('.el-drawer')).toBeHidden();
  });
});