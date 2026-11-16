import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5175',
    channel: 'chromium',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npx tsx e2e/server.ts',
      url: 'http://127.0.0.1:4010/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm --workspace apps/web run dev -- --port 5175 --strictPort',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:4010',
      },
    },
  ],
});
