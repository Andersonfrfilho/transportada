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

describe('o smoke só começa quando a landing responde de verdade', () => {
  /** Mesmo defeito medido no painel: `port:` aceita qualquer socket, `url:` exige HTTP. */
  test('a prontidão é HTTP, nunca só a porta', () => {
    expect(CONFIGURATION).not.toMatch(/^\s+port: /mu)
    expect([...CONFIGURATION.matchAll(/^\s+url: /gmu)]).toHaveLength(1)
  })

  test('a porta do preview vem do ambiente, não de uma segunda flag', () => {
    expect(PREVIEW_COMMANDS).toHaveLength(1)
    for (const command of PREVIEW_COMMANDS) expect(command).not.toContain('--port')
    expect(CONFIGURATION).toContain('FRONTEND_LANDING_PORT: String(FRONTEND_PORT)')
  })

  test('porta ocupada mata o preview em vez de servir noutra', () => {
    for (const command of PREVIEW_COMMANDS) expect(command).toContain('--strictPort')
  })
})
