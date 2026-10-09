/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 (T5.4): a derivação do status das mensagens do motorista — a leitura do escritório alcança a
 * mensagem por ordem de criação, e a mensagem do escritório segue com o status que já tem.
 */
import { describe, expect, test } from 'bun:test'

import { deriveOwnMessageStatus } from '../../src/occurrence-conversation/domain/driver-own-message-status.policy.js'

const AT = new Date('2026-10-09T14:00:00.000Z')
const inbound = { createdAt: AT, direction: 'inbound', status: null } as const

describe('deriveOwnMessageStatus', () => {
  test('ninguém do escritório leu: entregue', () => {
    expect(deriveOwnMessageStatus(inbound, null)).toBe('delivered')
  })

  test('a leitura alcança a mensagem (igual ou depois): lida', () => {
    expect(deriveOwnMessageStatus(inbound, AT)).toBe('read')
    expect(deriveOwnMessageStatus(inbound, new Date('2026-10-09T15:00:00.000Z'))).toBe('read')
  })

  test('a leitura parou antes da mensagem: entregue', () => {
    expect(deriveOwnMessageStatus(inbound, new Date('2026-10-09T13:59:59.999Z'))).toBe('delivered')
  })

  test('mensagem do escritório não é tocada', () => {
    const outbound = { createdAt: AT, direction: 'outbound', status: 'queued' } as const
    expect(deriveOwnMessageStatus(outbound, new Date('2026-10-09T15:00:00.000Z'))).toBe('queued')
  })
})
