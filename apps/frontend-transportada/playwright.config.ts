/* Copyright (c) 2026 Ada Technology. MIT License. */
import { defineConfig } from '@playwright/test'

const API_PORT = 53001
const FRONTEND_PORT = 53000
const REUSE_EXISTING_SERVER =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === 'true' || !process.env.CI

export default defineConfig({
  testDir: './test',
  testMatch: 'responsive.smoke.spec.ts',
  workers: 1,
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    browserName: 'chromium',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: [
    {
      command: `bun run build && bun run preview -- --port ${FRONTEND_PORT}`,
      port: FRONTEND_PORT,
      reuseExistingServer: REUSE_EXISTING_SERVER,
    },
    {
      command: 'bun run build && bun run start',
      cwd: '../api-transportada',
      port: API_PORT,
      reuseExistingServer: REUSE_EXISTING_SERVER,
    },
  ],
})
