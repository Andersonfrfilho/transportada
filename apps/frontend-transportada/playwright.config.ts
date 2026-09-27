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
  /** Os prints de revisão de design (spec 159 T12) rodam por fora: não entram no smoke da CI. */
  testMatch: process.env.PLAYWRIGHT_TEST_MATCH ?? [
    'responsive.smoke.spec.ts',
    'field-delivery.smoke.spec.ts',
    'field-delivery-cargo.smoke.spec.ts',
    'trip-timeline.smoke.spec.ts',
  ],
  workers: 1,
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    browserName: 'chromium',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  /**
   * ⚠️ **`url:`, nunca `port:`.** `port:` dá por pronto o primeiro socket TCP que aceitar conexão
   * na porta — e o runner sorteia porta de origem em 32768-60999, a mesma faixa em que publicamos.
   * Medido no gate de 2026-09-26: a prontidão da 53110 passou 83s antes de o `vite preview`
   * iniciar, o Playwright abriu os testes sem servidor e os 31 primeiros morreram em
   * `ERR_CONNECTION_REFUSED`. `url:` exige resposta HTTP 2xx/3xx, que só a app dá.
   *
   * ⚠️ **A porta vai por `env`, não por segunda flag.** O script `preview` já injeta
   * `--port ${FRONTEND_PORT:-5173}` lido do `.env`, então passar `--port` aqui produzia
   * `--port 53000 --port 53110` e deixava a porta servida na mão da ordem dos argumentos.
   * `--strictPort` fecha o resto: porta ocupada mata o preview em vez de servir na seguinte.
   */
  webServer: [
    {
      command: 'bun run build && bun run preview -- --strictPort',
      env: { FRONTEND_PORT: String(FRONTEND_PORT) },
      url: `http://localhost:${FRONTEND_PORT}/`,
      reuseExistingServer: REUSE_EXISTING_FRONTEND_SERVER,
      timeout: WEB_SERVER_TIMEOUT_MS,
    },
    {
      command: 'bun run build && bun run start',
      cwd: '../api-transportada',
      url: `http://localhost:${API_PORT}/health/live`,
      reuseExistingServer: REUSE_EXISTING_API_SERVER,
      timeout: WEB_SERVER_TIMEOUT_MS,
    },
  ],
})
