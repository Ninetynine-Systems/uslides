import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  forbidOnly: !!process.env.CI,
  testDir: 'tests/e2e',
  // A test that fails once is run again. A busy machine makes a different test miss its timing on
  // each run; a real failure fails both times. The report marks a test that needed a second try as flaky.
  retries: 1,
  use: { baseURL: 'http://localhost:4173', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', testIgnore: /speed\.spec\.ts$/, use: { ...devices['Desktop Chrome'] } },
    // The stopwatch tests run alone, once the other tests have finished, so a busy machine does not fail them.
    // They are skipped when another test has failed.
    { name: 'speed', testMatch: /speed\.spec\.ts$/, dependencies: ['chromium'], use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
