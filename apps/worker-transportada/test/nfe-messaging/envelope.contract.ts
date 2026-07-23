/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { nfeProcessingEnvelopeV1Schema } from '../../src/messaging/nfe-processing-envelope.schema.js'

const validImportEnvelope = {
  eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
  type: 'transportada.nfe.import.requested' as const,
  version: 1 as const,
  occurredAt: '2026-07-22T20:00:00.000Z',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  correlationId: 'contract-test-correlation',
  payload: {
    importId: '97ba42a6-8b96-47c0-bdb5-b75dfed2f95c',
  },
}

describe('NF-e processing envelope v1 contract', () => {
  it('accepts import and distribution commands with only routing claims and aggregate IDs', () => {
    const importResult = nfeProcessingEnvelopeV1Schema.safeParse(validImportEnvelope)
    const distributionResult = nfeProcessingEnvelopeV1Schema.safeParse({
      ...validImportEnvelope,
      type: 'transportada.nfe.distribution.requested',
    })

    expect(importResult.success).toBe(true)
    expect(distributionResult.success).toBe(true)
    if (importResult.success) {
      expect(importResult.data).toEqual(validImportEnvelope)
    }
  })

  it.each([
    ['invalid event ID', { ...validImportEnvelope, eventId: 'not-a-uuid' }],
    ['unsupported type', { ...validImportEnvelope, type: 'transportada.nfe.xml.uploaded' }],
    ['unsupported version', { ...validImportEnvelope, version: 2 }],
    ['invalid occurrence date', { ...validImportEnvelope, occurredAt: 'today' }],
    ['invalid company claim', { ...validImportEnvelope, companyId: 'tenant-from-client' }],
    ['invalid actor claim', { ...validImportEnvelope, actorId: 'actor-from-client' }],
    ['invalid import ID', { ...validImportEnvelope, payload: { importId: 'not-a-uuid' } }],
    ['unknown envelope field', { ...validImportEnvelope, credential: 'secret' }],
    [
      'raw XML leak',
      { ...validImportEnvelope, payload: { ...validImportEnvelope.payload, xml: '<NFe />' } },
    ],
    [
      'storage key leak',
      {
        ...validImportEnvelope,
        payload: { ...validImportEnvelope.payload, storageKey: 'tenant/nfe.xml' },
      },
    ],
    [
      'filename leak',
      { ...validImportEnvelope, payload: { ...validImportEnvelope.payload, filename: 'nfe.xml' } },
    ],
    [
      'SEFAZ response leak',
      { ...validImportEnvelope, payload: { ...validImportEnvelope.payload, sefazResponse: 'ok' } },
    ],
  ])('rejects %s', (_caseName, envelope) => {
    expect(nfeProcessingEnvelopeV1Schema.safeParse(envelope).success).toBe(false)
  })
})
