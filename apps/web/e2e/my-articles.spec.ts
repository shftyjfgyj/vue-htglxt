import { expect, test } from '@playwright/test';

test.describe('创作中心（我的文章）', () => {
  test.use({ storageState: 'e2e/.auth/editor.json' });

  test('数据概览与状态分栏可用，草稿筛选生效', async ({ page }) => {
    await page.goto('/content/my-articles');
    await expect(page.getByRole('heading', { name: '我的文章' })).toBeVisible();
    // 四张统计卡
    await expect(page.getByText('全部文章')).toBeVisible();
    await expect(page.getByText('已发布', { exact: true }).first()).toBeVisible();
    await expect(page.locator('.stat-label', { hasText: '互动数据' })).toBeVisible();

    // 状态分栏：切到「草稿」后，列表里不应出现「已发布」状态标签
    await page.locator('.status-chip', { hasText: '草稿' }).click();
    await expect(page.locator('.status-chip.is-active')).toContainText('草稿');
    const rows = page.locator('.el-table__body tr');
    await expect(rows.first()).toBeVisible();
    await expect(page.locator('.el-table__body').getByText('已发布')).toHaveCount(0);
  });

  test('复制为新草稿 -> 删除进回收站 -> 恢复', async ({ page, request }) => {
    const fs = await import('node:fs');
    const state = JSON.parse(fs.readFileSync('e2e/.auth/editor.json', 'utf8'));
    const token = JSON.parse(state.origins[0].localStorage[0].value).accessToken as string;
    const api = 'http://127.0.0.1:3001';
    const originalTitle = 'E2E 创作中心 ' + Date.now();

    // 用接口造一篇唯一标题的草稿，避免与其他数据混淆
    await request.post(api + '/api/v1/articles', {
      headers: { Authorization: 'Bearer ' + token },
      data: { title: originalTitle, summary: 'E2E 创作中心用例', content: '<p>E2E 正文</p>', submit: false }
    });

    await page.goto('/content/my-articles');
    await page.getByPlaceholder('搜索标题 / 摘要 / 正文').fill(originalTitle);
    await page.getByRole('button', { name: '查询' }).click();
    const row = page.locator('.el-table__body tr').first();
    await expect(row.locator('.cell-title')).toHaveText(originalTitle);
    await expect(row).toBeVisible();

    // 复制为新草稿（会跳到编辑页）
    await row.getByRole('button', { name: /更多/ }).click();
    await page.getByRole('menuitem', { name: '复制为新草稿' }).click();
    await expect(page).toHaveURL(/\/content\/articles\/\d+\/edit/);
    const titleInput = page.getByPlaceholder('请输入标题');
    await expect(titleInput).toHaveValue(originalTitle + '（副本）');

    // 回列表把它删掉进回收站
    await page.goto('/content/my-articles');
    await page.getByPlaceholder('搜索标题 / 摘要 / 正文').fill(originalTitle + '（副本）');
    await page.getByRole('button', { name: '查询' }).click();
    const copyRow = page.locator('.el-table__body tr').first();
    await expect(copyRow.locator('.cell-title')).toHaveText(originalTitle + '（副本）');
    await expect(copyRow).toBeVisible();
    await copyRow.getByRole('button', { name: /更多/ }).click();
    await page.getByRole('menuitem', { name: '删除' }).click();
    await page.getByRole('button', { name: '确定' }).click();
    await expect(page.getByText('已移入回收站')).toBeVisible();
    await expect(page.locator('.el-table__body').getByText(originalTitle + '（副本）')).toHaveCount(0);

    // 回收站里能看到并恢复
    await page.getByRole('button', { name: /回收站/ }).click();
    await page.getByPlaceholder('搜索标题 / 摘要 / 正文').fill(originalTitle + '（副本）');
    await page.getByRole('button', { name: '查询' }).click();
    const trashRow = page.locator('.el-table__body tr').first();
    await expect(trashRow.locator('.cell-title')).toHaveText(originalTitle + '（副本）');
    await trashRow.getByRole('button', { name: '恢复' }).click();
    await expect(page.getByText('已恢复到草稿箱')).toBeVisible();
    await expect(page.locator('.el-table__body').getByText(originalTitle + '（副本）')).toHaveCount(0);

    // 回到正常列表，草稿分栏里能再看到它
    await page.getByRole('button', { name: /回收站/ }).click();
    await page.locator('.status-chip', { hasText: '草稿' }).click();
    await page.getByPlaceholder('搜索标题 / 摘要 / 正文').fill(originalTitle + '（副本）');
    await page.getByRole('button', { name: '查询' }).click();
    await expect(page.locator('.el-table__body tr').first().locator('.cell-title')).toHaveText(originalTitle + '（副本）');

    // 清理：把两篇 E2E 文章都移入回收站，避免污染列表
    for (const id of [originalTitle, originalTitle + '（副本）']) {
      const found = await request.get(api + '/api/v1/articles?onlyMine=true&keyword=' + encodeURIComponent(id) + '&page=1&pageSize=5', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const list = (await found.json()).data.list as Array<{ id: number; title: string }>;
      const hit = list.find((item) => item.title === id);
      if (hit) {
        await request.delete(api + '/api/v1/articles/' + hit.id, { headers: { Authorization: 'Bearer ' + token } });
      }
    }
  });
});