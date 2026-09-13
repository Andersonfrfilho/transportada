/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE,
  contractorMailOutboundEnvelopeV1Schema,
} from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'

function buildEnvelope(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    companyId: crypto.randomUUID(),
    correlationId: 'contractor-mail-outbound-contract-0001',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: { messageId: crypto.randomUUID() },
    type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
    version: 1,
    ...overrides,
  }
}

describe('contractor mail outbound envelope v1 (spec 143, T009 — correção pós-entrega)', () => {
  test('accepts a well-formed envelope carrying only messageId', () => {
    expect(() => contractorMailOutboundEnvelopeV1Schema.parse(buildEnvelope())).not.toThrow()
  })

  test('rejects an unknown top-level field', () => {
    expect(() =>
      contractorMailOutboundEnvelopeV1Schema.parse(buildEnvelope({ extra: 'nope' })),
    ).toThrow()
  })

  /**
   * §6 do baseline de segurança: o job carrega referência, nunca dado — e a correção pós-entrega da
   * T009 existe exatamente para isso. Nenhum campo além de `messageId` pode voltar a entrar aqui:
   * nem endereço, nem token, nem assunto, nem corpo.
   */
  test('rejects any payload field besides messageId — the referência-only contract', () => {
    const forbiddenPayloads = [
      { messageId: crypto.randomUUID(), toAddress: 'admin@example.com' },
      { messageId: crypto.randomUUID(), replyToAddress: 'token@resposta.example.com' },
      { messageId: crypto.randomUUID(), subject: 'leaked subject' },
      { messageId: crypto.randomUUID(), bodyText: 'leaked body' },
    ]

    for (const payload of forbiddenPayloads) {
      expect(() =>
        contractorMailOutboundEnvelopeV1Schema.parse(buildEnvelope({ payload })),
      ).toThrow()
    }
  })

  test('requires messageId in the payload', () => {
    expect(() =>
      contractorMailOutboundEnvelopeV1Schema.parse(buildEnvelope({ payload: {} })),
    ).toThrow()
  })
})
