import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node --env-file=.env apps/api/dist/apps/api/src/main.js',
      url: 'http://127.0.0.1:4000/api/health',
      reuseExistingServer: false,
      env: { NODE_ENV: 'development' },
    },
    {
      command: 'npm run start -w @nexalid/web',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      env: { PORT: '3000', NODE_ENV: 'production' },
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
