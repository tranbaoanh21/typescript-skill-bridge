import { defineConfig, devices } from '@playwright/test';

const apiPort = 3100;
const webPort = 4173;
const webUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env['CI']),
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  outputDir: 'test-results/playwright',
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { height: 900, width: 1440 } },
    },
    {
      name: 'tablet-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { height: 1180, width: 820 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
  ],
  reporter: process.env['CI']
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  retries: process.env['CI'] ? 2 : 0,
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: webUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev --workspace @skillbridge/api',
      env: {
        AUTH_TOKEN_AUDIENCE: 'skillbridge-e2e-clients',
        AUTH_TOKEN_ISSUER: 'skillbridge-e2e',
        DATABASE_POOL_MAX: '8',
        DATABASE_URL:
          process.env['E2E_DATABASE_URL'] ??
          'postgresql://skillbridge:skillbridge@127.0.0.1:5434/skillbridge_test',
        ENABLE_API_DOCS: 'false',
        JWT_ACCESS_SECRET: 'e2e-secret-with-at-least-thirty-two-characters',
        JWT_ACCESS_TTL_SECONDS: '900',
        NODE_ENV: 'test',
        PORT: String(apiPort),
        ...(process.env['REDIS_URL'] ? { REDIS_URL: process.env['REDIS_URL'] } : {}),
        REFRESH_TOKEN_TTL_DAYS: '30',
        WEB_ORIGIN: webUrl,
      },
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      url: `http://127.0.0.1:${apiPort}/health/ready`,
    },
    {
      command: `npm run dev --workspace @skillbridge/web -- --host 127.0.0.1 --port ${webPort}`,
      env: {
        VITE_API_DOCS_URL: `http://127.0.0.1:${apiPort}/docs`,
        VITE_API_URL: `http://127.0.0.1:${apiPort}/api/v1`,
        VITE_REALTIME_URL: `http://127.0.0.1:${apiPort}`,
      },
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      url: webUrl,
    },
  ],
  ...(process.env['CI'] ? { workers: 1 } : {}),
});
