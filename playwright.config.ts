import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e_ui',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/phm/',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-readonly',
      grepInvert: /@mutations/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mutations',
      grep: /@mutations/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4174/phm/',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173/phm/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --mode e2e-mutations --host 127.0.0.1 --port 4174',
      url: 'http://127.0.0.1:4174/phm/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
