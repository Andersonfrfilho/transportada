/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const WORKER_FILE = new URL(
  '../../src/whatsapp-inbox-expire/infrastructure/drizzle-whatsapp-inbox-expire.repository.ts',
  import.meta.url,
)
const API_FILE = new URL(
  '../../../api-transportada/src/whatsapp-inbox/infrastructure/drizzle-whatsapp-chat.repository.ts',
  import.meta.url,
)

/** As atribuições do `SET`: o que a devolução por vencimento grava, linha a linha. */
const ASSIGNMENT_LINES = [
  "set state = 'bot',",
  'taken_over_by_user_id = null,',
  'taken_over_at = null,',
  'expires_at = null,',
  "release_reason = 'expired',",
  'released_by_user_id = null,',
  'updated_at = now()',
]

/**
 * ⚠️ **Cópia por valor.** O worker devolve o chat por SQL próprio; se a API mudar o que `expireDue` grava e a cópia
 * não acompanhar, o vencimento deixa a conversa num estado que a caixa não reconhece.
 */
describe('whatsapp chat expiry SQL mirror parity (spec 319 T7)', () => {
  test('o worker grava exatamente o que a API grava ao devolver por vencimento', async () => {
    const [worker, api] = await Promise.all([
      readFile(WORKER_FILE, 'utf8'),
      readFile(API_FILE, 'utf8'),
    ])
    for (const line of ASSIGNMENT_LINES) {
      expect(api).toContain(line)
      expect(worker).toContain(line)
    }
    expect(worker).toContain("where state = 'operator' and expires_at <=")
    expect(api).toContain("where state = 'operator' and expires_at <=")
    expect(worker).toContain('for update skip locked')
  })
})
