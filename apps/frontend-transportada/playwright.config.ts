/* Copyright (c) 2026 Ada Technology. MIT License. */
import { defineConfig } from '@playwright/test'

const API_PORT = Number(process.env.PLAYWRIGHT_API_PORT ?? '53001')
const FRONTEND_PORT = Number(process.env.PLAYWRIGHT_FRONTEND_PORT ?? '53000')

function shouldReuseExistingServer(variableName: string): boolean {
  const variableValue = process.env[variableName]
  if (variableValue === 'true') {
    return true
  }
  if (variableValue === 'false') {
    return false
  }
  return !process.env.CI
}

/** O comando compila antes de servir: os 60s padrão do Playwright cobrem build e boot juntos. */
const WEB_SERVER_TIMEOUT_MS = 180_000

const REUSE_EXISTING_API_SERVER = shouldReuseExistingServer('PLAYWRIGHT_REUSE_EXISTING_API_SERVER')
const REUSE_EXISTING_FRONTEND_SERVER = shouldReuseExistingServer(
  'PLAYWRIGHT_REUSE_EXISTING_FRONTEND_SERVER',
)

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
      reuseExistingServer: REUSE_EXISTING_FRONTEND_SERVER,
      timeout: WEB_SERVER_TIMEOUT_MS,
    },
    {
      command: 'bun run build && bun run start',
      cwd: '../api-transportada',
      port: API_PORT,
      reuseExistingServer: REUSE_EXISTING_API_SERVER,
      timeout: WEB_SERVER_TIMEOUT_MS,
    },
  ],
})
