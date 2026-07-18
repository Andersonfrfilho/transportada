/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'
import { syntheticMessageEnvelopeV1Schema } from '../src/messaging/message-envelope.schema.js'

const validEnvelope = {
  eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
  type: 'transportada.synthetic' as const,
  version: 1 as const,
  occurredAt: '2026-07-18T20:00:00.000Z',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
  correlationId: 'contract-test-correlation',
  payload: {
    operation: 'contract-test',
  },
}

describe('synthetic message envelope v1 contract', () => {
  it('accepts a typed v1 envelope', () => {
    const result = syntheticMessageEnvelopeV1Schema.safeParse(validEnvelope)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validEnvelope)
    }
  })

  it.each([
    ['invalid event ID', { ...validEnvelope, eventId: 'not-a-uuid' }],
    ['unsupported version', { ...validEnvelope, version: 2 }],
    ['invalid occurrence date', { ...validEnvelope, occurredAt: 'yesterday' }],
    ['invalid company ID', { ...validEnvelope, companyId: 'tenant-from-client' }],
    ['missing payload', { ...validEnvelope, payload: undefined }],
    ['unknown envelope field', { ...validEnvelope, credential: 'secret' }],
  ])('rejects %s', (_case, envelope) => {
    expect(syntheticMessageEnvelopeV1Schema.safeParse(envelope).success).toBe(false)
  })
})
