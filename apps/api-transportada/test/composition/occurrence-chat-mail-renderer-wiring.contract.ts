/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 T3.1: o chat por e-mail só funciona se `main.ts` entrega o `renderer` ao caso de uso — sem ele a variante
 * `mode: 'chat'` responde 503 em produção sem derrubar teste algum. O renderer é o `standardEmail.render` do SDK.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const MAIN_TS_PATH = new URL('../../src/main.ts', import.meta.url)
const USE_CASE_CALL = 'sendChatMail: createSendOccurrenceChatMailUseCase({'
const MAX_ARGUMENT_LENGTH = 1800

describe('fiação do chat por e-mail em main.ts (spec 274 T3.1)', () => {
  const source = readFileSync(MAIN_TS_PATH, 'utf8')
  const start = source.indexOf(USE_CASE_CALL)
  const block = source.slice(start, start + MAX_ARGUMENT_LENGTH)

  test('o caso de uso do chat existe uma vez só', () => {
    expect(start).toBeGreaterThan(-1)
    expect(source.indexOf(USE_CASE_CALL, start + 1)).toBe(-1)
  })

  test('recebe o renderer do SDK, no locale padrão, e não sobra TODO', () => {
    expect(block).toContain('renderer:')
    expect(block).toContain('notifications.standardEmail.render({')
    expect(block).toContain('locale: NOTIFICATION_DEFAULT_LOCALE')
    expect(source).not.toContain('TODO(T3.1)')
  })
})
