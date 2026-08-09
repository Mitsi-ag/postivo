import { defineConfig } from '@playwright/test';

// Runs against a locally-started instance (see README / PHASE3 runbook):
//   docker compose up -d --wait
//   PORT=3220 DATABASE_URL=postgres://postivo:postivo@localhost:5432/postivo \
//     SSRF_ALLOW_HOSTS=localhost,127.0.0.1 npm run start
//   npm run test:e2e
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  workers: 1, // serial: tests share the app's per-IP rate limiter buckets
  reporter: 'line',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3220',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile-chromium',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 } },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
