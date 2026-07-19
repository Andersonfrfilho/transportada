import { defineConfig } from '@playwright/test'

const FRONTEND_PORT = 4173

export default defineConfig({
  testDir: './test',
  testMatch: 'responsive.smoke.spec.ts',
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    browserName: 'chromium',
  },
  webServer: {
    command: `bun run preview -- --port ${FRONTEND_PORT}`,
    port: FRONTEND_PORT,
    reuseExistingServer: false,
  },
})
