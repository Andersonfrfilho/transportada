/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CONTRACTOR_MAIL_INBOUND_EVENT_TYPE,
  contractorMailInboundEnvelopeV1Schema,
} from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'

function buildEnvelope(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    companyId: crypto.randomUUID(),
    correlationId: 'contractor-mail-inbound-contract-0001',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: { providerEmailId: 'evt_0001' },
    type: CONTRACTOR_MAIL_INBOUND_EVENT_TYPE.EMAIL_RECEIVED,
    version: 1,
    ...overrides,
  }
}

describe('contractor mail inbound envelope v1 (spec 143, T010)', () => {
  test('accepts a well-formed envelope carrying only providerEmailId', () => {
    expect(() => contractorMailInboundEnvelopeV1Schema.parse(buildEnvelope())).not.toThrow()
  })

  test('rejects an unknown top-level field', () => {
    expect(() =>
      contractorMailInboundEnvelopeV1Schema.parse(buildEnvelope({ extra: 'nope' })),
    ).toThrow()
  })

  /**
   * plan.md § Contratos/API/eventos: "Payload de entrada na fila: { companyId, providerEmailId }.
   * O worker busca o resto no Resend." Nenhum outro campo — nem endereço, nem assunto, nem corpo —
   * atravessa o broker.
   */
  test('rejects any payload field besides providerEmailId — the referência-only contract', () => {
    const forbiddenPayloads = [
      { fromAddress: 'contratante@example.com', providerEmailId: 'evt_1' },
      { providerEmailId: 'evt_2', subject: 'leaked subject' },
      { providerEmailId: 'evt_3', bodyText: 'leaked body' },
    ]

    for (const payload of forbiddenPayloads) {
      expect(() =>
        contractorMailInboundEnvelopeV1Schema.parse(buildEnvelope({ payload })),
      ).toThrow()
    }
  })

  test('requires providerEmailId in the payload', () => {
    expect(() =>
      contractorMailInboundEnvelopeV1Schema.parse(buildEnvelope({ payload: {} })),
    ).toThrow()
  })
})
