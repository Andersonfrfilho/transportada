/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const CONFIGURATION = readFileSync(
  new URL('../../playwright.config.ts', import.meta.url).pathname,
  'utf8',
)

const PREVIEW_COMMANDS = [
  ...CONFIGURATION.matchAll(
    /command: `([^`]*bun run preview[^`]*)`|command: '([^']*bun run preview[^']*)'/gu,
  ),
].map((match) => match[1] ?? match[2])

describe('o smoke só começa quando a app responde de verdade', () => {
  /**
   * ⚠️ **`port:` é uma conexão TCP, não a app.** O Playwright dá por pronto o primeiro socket que
   * aceitar, e o runner sorteia porta de origem na mesma faixa em que publicamos. Foi o que
   * derrubou o gate: a prontidão passou 83s antes de o `vite preview` sequer iniciar, e os 31
   * primeiros testes bateram em `ERR_CONNECTION_REFUSED`. `url:` exige resposta HTTP — um socket
   * que não fala HTTP não passa.
   */
  test('a prontidão é HTTP, nunca só a porta', () => {
    expect(CONFIGURATION).not.toMatch(/^\s+port: /mu)
    expect([...CONFIGURATION.matchAll(/^\s+url: /gmu)]).toHaveLength(2)
  })

  /**
   * ⚠️ **Duas flags `--port` deixam a porta servida na mão da ordem dos argumentos.** O script
   * `preview` já injeta `--port ${FRONTEND_PORT:-5173}` a partir do `.env`, então acrescentar
   * outra produzia `--port 53000 --port 53110`. A porta vem por variável, uma vez só.
   */
  test('a porta do preview vem do ambiente, não de uma segunda flag', () => {
    expect(PREVIEW_COMMANDS).toHaveLength(1)
    for (const command of PREVIEW_COMMANDS) expect(command).not.toContain('--port')
    expect(CONFIGURATION).toContain('FRONTEND_PORT: String(FRONTEND_PORT)')
  })

  /** Sem `--strictPort` o Vite serve na porta seguinte e o smoke morre longe da causa. */
  test('porta ocupada mata o preview em vez de servir noutra', () => {
    for (const command of PREVIEW_COMMANDS) expect(command).toContain('--strictPort')
  })
})
