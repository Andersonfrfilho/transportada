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
    payload: {
      messageId: crypto.randomUUID(),
      replyToAddress: 'abcdefghijklmnopqrstuvwxyz@resposta.example.com.br',
      toAddress: 'admin@example.com.br',
    },
    type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
    version: 1,
    ...overrides,
  }
}

describe('contractor mail outbound envelope v1 (spec 143, T009)', () => {
  test('accepts a well-formed envelope', () => {
    expect(() => contractorMailOutboundEnvelopeV1Schema.parse(buildEnvelope())).not.toThrow()
  })

  test('rejects a body payload — só referência viaja na fila', () => {
    expect(() =>
      contractorMailOutboundEnvelopeV1Schema.parse(
        buildEnvelope({ payload: { bodyText: 'leaked', messageId: crypto.randomUUID() } }),
      ),
    ).toThrow()
  })

  test('rejects an unknown top-level field', () => {
    expect(() =>
      contractorMailOutboundEnvelopeV1Schema.parse(buildEnvelope({ extra: 'nope' })),
    ).toThrow()
  })

  test('requires messageId, toAddress and replyToAddress in the payload', () => {
    expect(() =>
      contractorMailOutboundEnvelopeV1Schema.parse(
        buildEnvelope({ payload: { messageId: crypto.randomUUID() } }),
      ),
    ).toThrow()
  })
})
