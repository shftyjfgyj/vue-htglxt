import { expect, test } from '@playwright/test';

// admin 口令可能已被修改，支持环境变量覆盖：$env:E2E_ADMIN_PASSWORD='新密码'
const ADMIN = { username: process.env.E2E_ADMIN_USER || 'admin', password: process.env.E2E_ADMIN_PASSWORD || 'Admin@123456' };

test.describe('未登录状态', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('访问后台页面会跳转登录页', async ({ page }) => {
    await page.goto('/content/articles');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('后台管理系统')).toBeVisible();
  });

  test('错误密码给出提示且停留在登录页', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('用户名').fill('admin');
    await page.getByPlaceholder('密码').fill('wrong-password');
    await page.getByRole('button', { name: '登 录' }).click();
    await expect(page.getByText('用户名或密码错误')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('通过登录表单可以进入看板（覆盖登录 UI 链路）', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('用户名').fill(ADMIN.username);
    await page.getByPlaceholder('密码').fill(ADMIN.password);
    await page.getByRole('button', { name: '登 录' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('link', { name: '数据看板' })).toBeVisible();
  });
});

test.describe('管理员（复用登录态）', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('看板显示统计数据与趋势', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('文章总数')).toBeVisible();
    await expect(page.getByText('用户总数')).toBeVisible();
    await expect(page.getByText('近 7 天多维趋势')).toBeVisible();
    await expect(page.getByText('热门文章 Top 10')).toBeVisible();
  });

  test('侧栏包含系统管理与个人中心分组', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = page.locator('.admin-aside');
    await expect(sidebar.getByText('系统管理')).toBeVisible();
    await expect(sidebar.getByText('个人中心')).toBeVisible();

    // 展开系统管理后应看到四个子菜单（菜单由后端按权限下发）
    await sidebar.getByText('系统管理').click();
    await expect(sidebar.getByText('用户管理')).toBeVisible();
    await expect(sidebar.getByText('角色权限')).toBeVisible();
    await expect(sidebar.getByText('操作日志')).toBeVisible();
    await expect(sidebar.getByText('登录日志')).toBeVisible();
  });

  test('通知铃铛可展开并显示通知列表', async ({ page }) => {
    await page.goto('/dashboard');
    await page.locator('.notify-bell').click();
    await expect(page.getByText(/站内通知/)).toBeVisible();
  });

  test('退出登录后回到登录页', async ({ page }) => {
    await page.goto('/dashboard');
    await page.locator('.user-chip').click();
    await page.getByRole('menuitem', { name: '退出登录' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确定' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('内容编辑角色', () => {
  test.use({ storageState: 'e2e/.auth/editor.json' });

  test('可见内容管理但看不到系统管理菜单', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('内容管理')).toBeVisible();
    await expect(page.getByText('系统管理')).toHaveCount(0);
    await expect(page.getByText('用户管理')).toHaveCount(0);
  });

  test('直接访问用户管理路由会被拦截到 403', async ({ page }) => {
    await page.goto('/system/users');
    await expect(page.getByText('403')).toBeVisible();
  });

  test('个人中心显示账号信息与头像上传入口', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByText('账号信息')).toBeVisible();
    // el-upload 外层也带 role=button，因此按内部按钮定位
    await expect(page.locator('button').filter({ hasText: '更换头像' })).toBeVisible();
    await expect(page.getByText('关注管理')).toBeVisible();
  });
});