import { defineConfig } from '@playwright/test'

const FRONTEND_PORT = Number(process.env.PLAYWRIGHT_LANDING_PORT ?? '53010')

function shouldReuseExistingServer(variableName: string): boolean {
  const variableValue = process.env[variableName]
  if (variableValue === 'true') return true
  if (variableValue === 'false') return false

  return !process.env.CI
}

/** O comando compila antes de servir: os 60s padrão do Playwright cobrem build e boot juntos. */
const WEB_SERVER_TIMEOUT_MS = 180_000

export default defineConfig({
  testDir: './test',
  testMatch: 'application.smoke.spec.ts',
  workers: 1,
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    browserName: 'chromium',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  /**
   * Só a landing: a leitura do CCMEI acontece **no navegador** e não toca a API (spec 066, P2). Um
   * smoke que subisse a API junto passaria a depender dela para provar algo que não a envolve.
   */
  webServer: [
    {
      command: `bun run build && bun run preview -- --port ${FRONTEND_PORT}`,
      port: FRONTEND_PORT,
      reuseExistingServer: shouldReuseExistingServer('PLAYWRIGHT_REUSE_EXISTING_LANDING_SERVER'),
      timeout: WEB_SERVER_TIMEOUT_MS,
    },
  ],
})
