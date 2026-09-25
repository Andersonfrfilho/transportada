/* Copyright (c) 2026 Ada Technology. MIT License. */
import { defineConfig } from '@playwright/test'

const DRIVER_PORT = Number(process.env.PLAYWRIGHT_DRIVER_PORT ?? '53200')

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

const REUSE_EXISTING_DRIVER_SERVER = shouldReuseExistingServer(
  'PLAYWRIGHT_REUSE_EXISTING_DRIVER_SERVER',
)

/**
 * ⚠️ **`driver-service-worker.smoke.spec.ts` roda à parte** (T4.1): CA05(a) — recarregar sem rede
 * de verdade, `context.setOffline(true)` — e CA09 dependem do service worker precacheando o
 * shell, e o SW só registra fora do bypass de fumaça (`main.tsx`, `isSmokeAuthBypassEnabled`). O
 * resto do smoke roda **com** o bypass ligado, porque um SW real intercepta as rotas que o
 * `page.route` mocka. Os dois scripts (`smoke`/`smoke:service-worker`) fazem cada um o seu próprio
 * `vite build`, um atrás do outro — nunca no mesmo processo do Playwright.
 */
export default defineConfig({
  testDir: './test',
  testMatch: process.env.PLAYWRIGHT_TEST_MATCH ?? [
    'driver-app.smoke.spec.ts',
    'driver-service-worker.smoke.spec.ts',
  ],
  workers: 1,
  use: {
    baseURL: `http://localhost:${DRIVER_PORT}`,
    browserName: 'chromium',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: `bun run build && bun run preview -- --port ${DRIVER_PORT}`,
    port: DRIVER_PORT,
    reuseExistingServer: REUSE_EXISTING_DRIVER_SERVER,
    timeout: WEB_SERVER_TIMEOUT_MS,
  },
})
