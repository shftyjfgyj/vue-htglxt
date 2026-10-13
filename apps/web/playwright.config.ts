import { defineConfig, devices } from '@playwright/test';

/**
 * M6 浏览器级 E2E：
 * - 使用系统已安装的 Microsoft Edge（channel: msedge），无需下载 Playwright 浏览器
 * - 自动拉起后端（apps/server）与前端预览（apps/web dist）
 * - 如需真实浏览器窗口，运行 npx playwright test --headed
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  projects: [{ name: 'edge', use: { ...devices['Desktop Edge'] } }],
  webServer: [
    {
      command: 'node dist/index.js',
      cwd: '../server',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: true,
      timeout: 60_000,
      // E2E 会反复登录，放宽登录限流（生产默认 20 次/10 分钟）
      env: { LOGIN_RATE_LIMIT: '500', NODE_ENV: 'development' },
      stdout: 'ignore',
      stderr: 'pipe'
    },
    {
      command: 'npm run preview',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 60_000
    }
  ]
});
