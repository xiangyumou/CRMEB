import { defineConfig } from '@playwright/test';

import { DEVICE } from './src/device';

import { BASE_URL } from './src/stack-file';

/**
 * Storefront end-to-end suite (`docs/rewrite/briefs/I-storefront-e2e.md`).
 *
 * One command, from `next/`:
 *
 *     pnpm --filter @shop/e2e-storefront test
 *
 * `webServer` is `scripts/serve.ts`, mirroring `@shop/e2e-admin`'s: the whole
 * stack — Postgres, Redis, the fake WeChat Pay gateway and its control-plane
 * bridge, the seed, the H5 build, `next start` and the worker — comes up
 * inside one script so `SIGINT` tears all of it down together, and so the
 * containers exist before Playwright's own `globalSetup` would have run.
 *
 * `workers: 1`, for the same reason as the admin suite: every journey shares
 * one database and one Redis, so a group-buy team one spec opens must still
 * be there when the next spec's process reads it. The suite proves eight
 * user journeys work end to end, not that they can be run concurrently.
 *
 * The one project is a mobile Chromium emulation, not desktop: `manifest.json`
 * has no separate mobile-web build — the H5 bundle *is* what a phone browser
 * gets — and `config/app.js`'s `clientPlatform()` derives the platform from
 * `navigator.userAgent`, so the emulated device's UA is what makes the app
 * behave as H5 rather than assume a manual header would.
 */
export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A cold `next start` plus the fake gateway plus the worker booting is
  // slower than the admin suite's single Next server.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      // Chromium only, mobile viewport: these journeys assert what a shopper
      // on a phone browser sees, not cross-browser rendering.
      name: 'mobile-chromium',
      use: { ...DEVICE },
    },
  ],
  webServer: {
    command: 'pnpm exec tsx scripts/serve.ts',
    url: `${BASE_URL}/api/v1/health`,
    // Containers pull on a cold machine, `next build` runs once, and the H5
    // bundle builds once too when `dist/dev/h5` is stale.
    timeout: 900_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
