import { defineConfig, devices } from '@playwright/test';

/** End-to-end runs against the real built client served by the real server (BRIEF §9.3). */
// Point the whole suite at a deployment with TANDEM_BASE_URL, e.g.
//   TANDEM_BASE_URL=https://tandem.tandem-server.workers.dev npm run test:e2e
// With it set, no local server is started and the real deployed site is driven instead.
const DEPLOYED = process.env.TANDEM_BASE_URL;
const BASE = DEPLOYED ?? 'http://127.0.0.1:8788';

export default defineConfig({
  testDir: './e2e',
  // These are real-time multiplayer flows over a websocket, with a 3 s countdown in most of them.
  // The assertions are about eventual consistency, not speed; a loaded machine must not fail them.
  // Speed is measured separately and explicitly in perf.spec.ts.
  timeout: 120_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false } },
  ],
  webServer: DEPLOYED ? undefined : {
    command: 'npm run build -w @tandem/web && TANDEM_START=1 PORT=8788 node packages/server/src/node-main.ts',
    url: 'http://127.0.0.1:8788/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
