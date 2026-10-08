import {defineConfig} from '@playwright/test';

export default defineConfig({
  captureGitInfo: {commit: true, diff: false},
  testDir: './tests',
  testMatch: 'responsive.spec.ts',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 120_000,
  expect: {timeout: 10_000},
  outputDir: '.local/responsive/artifacts',
  reporter: [['list'], ['json', {outputFile: '.local/responsive/result.json'}]],
  use: {
    baseURL: 'http://127.0.0.1:5273',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    {name: 'chromium', use: {browserName: 'chromium'}},
    {name: 'webkit', use: {browserName: 'webkit'}},
  ],
  webServer: {
    command: 'node_modules/.bin/vite preview --config apps/web/vite.config.ts --host 127.0.0.1 --port 5273 --strictPort',
    url: 'http://127.0.0.1:5273',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
