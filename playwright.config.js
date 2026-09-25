import { defineConfig } from '@playwright/test';

// Real GPU via Metal/ANGLE in system Chrome so the WebGL scene renders as users see it.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5192',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1600, height: 900 },
    launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5192 --strictPort',
    url: 'http://localhost:5192',
    reuseExistingServer: true,
  },
});
