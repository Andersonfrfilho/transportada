/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { cteProcessingEnvelopeV1Schema } from '../src/messaging/cte-processing-envelope.schema.js'

const validEnvelope = {
  eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
  type: 'transportada.cte.item.issue.requested',
  version: 1,
  occurredAt: '2026-07-22T20:00:00.000Z',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  correlationId: 'contract-test-correlation',
  payload: {
    batchItemId: '8a7d8b98-ff3e-4f5f-9967-57fdb2e7e2d8',
    batchId: 'd2f4ef6d-4f5d-45af-a9b0-bf4e0f8f8d4d',
    attemptId: '4f6f2e89-bf9b-4d16-b7e7-d8ce6b0f6f5d',
    attemptFingerprint: 'ctefingerprint-001',
    attemptKind: 'issue',
    status: 'requested',
  },
} as const

describe('CT-e processing envelope v1 contract', () => {
  it('accepts canonical issue requested envelope', () => {
    const result = cteProcessingEnvelopeV1Schema.safeParse(validEnvelope)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validEnvelope)
    }
  })

  it.each([
    ['invalid event type', { ...validEnvelope, type: 'transportada.nfe.import.requested' }],
    ['invalid version', { ...validEnvelope, version: 2 }],
    [
      'invalid batch item id',
      { ...validEnvelope, payload: { ...validEnvelope.payload, batchItemId: 'bad' } },
    ],
    ['bad actor claim', { ...validEnvelope, actorId: 'actor-from-client' }],
  ])('rejects %s', (_caseName, envelope) => {
    expect(cteProcessingEnvelopeV1Schema.safeParse(envelope).success).toBe(false)
  })
})
