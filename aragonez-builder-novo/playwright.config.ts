import { defineConfig, devices } from '@playwright/test';

const PORTA = Number(process.env.E2E_PORTA || 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://127.0.0.1:${PORTA}`, locale: 'pt-BR', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      grepInvert: /@celular/,
    },
    { name: 'celular', use: { ...devices['Pixel 7'] }, grep: /@celular/ },
    // Safari: precisa do WebKit do Playwright instalado (npx playwright install --with-deps webkit). Ligue com PW_WEBKIT=1.
    ...(process.env.PW_WEBKIT
      ? [
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
            grepInvert: /@celular/,
          },
          { name: 'iphone', use: { ...devices['iPhone 15'] }, testMatch: /exportacao\.spec\.ts/ },
        ]
      : []),
  ],
  webServer: {
    command: `npx vite preview --port ${PORTA} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORTA}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
