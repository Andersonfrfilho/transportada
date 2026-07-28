/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { mdfeProcessingEnvelopeV1Schema } from '../src/messaging/mdfe-processing-envelope.schema.js'

const validEnvelope = {
  eventId: 'd0f0a1b2-2c3d-4e5f-8a9b-0c1d2e3f4a5b',
  type: 'transportada.mdfe.manifest.issue.requested',
  version: 1,
  occurredAt: '2026-07-28T12:00:00.000Z',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  correlationId: 'contract-test-correlation',
  payload: {
    manifestId: '8a7d8b98-ff3e-4f5f-9967-57fdb2e7e2d8',
    attemptId: '4f6f2e89-bf9b-4d16-b7e7-d8ce6b0f6f5d',
    attemptKind: 'issue',
    attemptFingerprint: 'mdfefingerprint-001',
    status: 'requested',
  },
} as const

describe('MDF-e processing envelope v1 contract', () => {
  it('accepts canonical issue requested envelope', () => {
    const result = mdfeProcessingEnvelopeV1Schema.safeParse(validEnvelope)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validEnvelope)
    }
  })

  it.each([
    ['close', 'transportada.mdfe.manifest.close.requested'],
    ['cancel', 'transportada.mdfe.manifest.cancel.requested'],
  ])('accepts the %s event', (attemptKind, type) => {
    const envelope = {
      ...validEnvelope,
      type,
      payload: { ...validEnvelope.payload, attemptKind },
    }

    expect(mdfeProcessingEnvelopeV1Schema.safeParse(envelope).success).toBe(true)
  })

  it.each([
    ['invalid event type', { ...validEnvelope, type: 'transportada.cte.item.issue.requested' }],
    ['invalid version', { ...validEnvelope, version: 2 }],
    [
      'invalid manifest id',
      { ...validEnvelope, payload: { ...validEnvelope.payload, manifestId: 'bad' } },
    ],
    [
      'unknown attempt kind',
      { ...validEnvelope, payload: { ...validEnvelope.payload, attemptKind: 'reprocess' } },
    ],
    ['bad actor claim', { ...validEnvelope, actorId: 'actor-from-client' }],
    [
      'unknown payload field',
      {
        ...validEnvelope,
        payload: { ...validEnvelope.payload, companyId: validEnvelope.companyId },
      },
    ],
  ])('rejects %s', (_caseName, envelope) => {
    expect(mdfeProcessingEnvelopeV1Schema.safeParse(envelope).success).toBe(false)
  })
})
