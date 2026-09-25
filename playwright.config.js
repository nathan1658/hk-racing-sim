import { defineConfig } from '@playwright/test';

// Real GPU via Metal/ANGLE in system Chrome so the WebGL scene renders as users see it.
// BASE_URL=https://nathan1658.github.io/hk-racing-sim/ npm run e2e  → test the live deployment.
const liveUrl = process.env.BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: liveUrl ?? 'http://localhost:5192',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1600, height: 900 },
    launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
  },
  webServer: liveUrl
    ? undefined
    : { command: 'npx vite --port 5192 --strictPort', url: 'http://localhost:5192', reuseExistingServer: true },
});
