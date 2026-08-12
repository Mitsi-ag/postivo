import { defineConfig } from '@playwright/test';

// Runs against a locally-started instance (see README / PHASE3 runbook):
//   docker compose up -d --wait
//   PORT=3220 DATABASE_URL=postgres://postivo:postivo@localhost:5432/postivo \
//     npm run start
// (.env provides SSRF_ALLOW_HOSTS=localhost — whitelisting 127.0.0.1 too would
//  defeat the provider-SSRF hardening test.)
//   npm run test:e2e
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  // Dev-mode cold compiles can exceed the 5s assertion default even with
  // scripts/prewarm.sh — give assertions room instead of flaking.
  expect: { timeout: 15_000 },
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
