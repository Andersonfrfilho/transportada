/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  NFSE_PROCESSING_EVENT_TYPE,
  nfseProcessingEnvelopeV1Schema,
} from '../src/messaging/nfse-processing-envelope.schema.js'

const validEnvelope = {
  eventId: '2f0b6c1e-9f2a-4a71-8f3f-7f1f0e2d3c4b',
  type: 'transportada.nfse.invoice.issue.requested',
  version: 1,
  occurredAt: '2026-08-12T12:00:00.000Z',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  correlationId: 'contract-test-correlation',
  payload: {
    invoiceId: '6a1c9b30-4d2f-4a58-9d0e-1b2c3d4e5f60',
    attemptId: 'd4a2f1c8-3b5e-4c7a-9f01-2e3d4c5b6a70',
    attemptKind: 'issue',
    attemptFingerprint: 'nfsefingerprint-001',
    status: 'requested',
  },
} as const

describe('NFS-e processing envelope v1 contract', () => {
  it('accepts the canonical issue requested envelope', () => {
    const result = nfseProcessingEnvelopeV1Schema.safeParse(validEnvelope)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validEnvelope)
    }
  })

  it('accepts the cancel requested envelope', () => {
    const envelope = {
      ...validEnvelope,
      type: NFSE_PROCESSING_EVENT_TYPE.INVOICE_CANCEL_REQUESTED,
      payload: {
        ...validEnvelope.payload,
        attemptKind: 'cancel',
        status: 'cancellation_requested',
      },
    }

    expect(nfseProcessingEnvelopeV1Schema.safeParse(envelope).success).toBe(true)
  })

  it('publishes the two event types the API writes to the outbox', () => {
    expect(NFSE_PROCESSING_EVENT_TYPE).toEqual({
      INVOICE_CANCEL_REQUESTED: 'transportada.nfse.invoice.cancel.requested',
      INVOICE_ISSUE_REQUESTED: 'transportada.nfse.invoice.issue.requested',
    })
  })

  it.each([
    [
      'event type from another rail',
      { ...validEnvelope, type: 'transportada.cte.item.issue.requested' },
    ],
    [
      'unknown nfse event type',
      { ...validEnvelope, type: 'transportada.nfse.invoice.replace.requested' },
    ],
    ['future envelope version', { ...validEnvelope, version: 2 }],
    ['missing company id', { ...validEnvelope, companyId: undefined }],
    ['company id from the client', { ...validEnvelope, companyId: 'company-from-client' }],
    ['bad actor claim', { ...validEnvelope, actorId: 'actor-from-client' }],
    ['bad occurrence timestamp', { ...validEnvelope, occurredAt: '12/08/2026' }],
    ['blank correlation id', { ...validEnvelope, correlationId: '   ' }],
    ['unknown envelope field', { ...validEnvelope, queuePrefix: 'transportada.local' }],
    [
      'missing invoice id',
      { ...validEnvelope, payload: { ...validEnvelope.payload, invoiceId: undefined } },
    ],
    [
      'invoice id that is not a uuid',
      { ...validEnvelope, payload: { ...validEnvelope.payload, invoiceId: 'invoice-1' } },
    ],
    [
      'attempt id that is not a uuid',
      { ...validEnvelope, payload: { ...validEnvelope.payload, attemptId: 'attempt-1' } },
    ],
    [
      'unknown attempt kind',
      { ...validEnvelope, payload: { ...validEnvelope.payload, attemptKind: 'replace' } },
    ],
    [
      'blank attempt fingerprint',
      { ...validEnvelope, payload: { ...validEnvelope.payload, attemptFingerprint: '' } },
    ],
    [
      'unknown payload field',
      {
        ...validEnvelope,
        payload: { ...validEnvelope.payload, companyId: validEnvelope.companyId },
      },
    ],
  ])('rejects %s', (_caseName, envelope) => {
    expect(nfseProcessingEnvelopeV1Schema.safeParse(envelope).success).toBe(false)
  })

  /**
   * Nem o código do motivo nem o texto livre do operador entram na fila: os dois já estão gravados
   * na nota, com check no banco, e payload de mensagem carrega referência, não conteúdo
   * (`security.md` §6). O worker lê o código da linha da nota na hora de transmitir.
   */
  it.each([
    ['reason', { cancellationReason: 'Serviço não prestado' }],
    ['motive code', { cancellationMotive: '2' }],
  ])('refuses to carry the cancellation %s through the queue', (_caseName, extra) => {
    const envelope = {
      ...validEnvelope,
      type: NFSE_PROCESSING_EVENT_TYPE.INVOICE_CANCEL_REQUESTED,
      payload: { ...validEnvelope.payload, attemptKind: 'cancel', ...extra },
    }

    expect(nfseProcessingEnvelopeV1Schema.safeParse(envelope).success).toBe(false)
  })

  /** Nenhum campo do envelope carrega segredo: o token continua selado na credencial. */
  it('has no field for provider credentials', () => {
    const envelope = {
      ...validEnvelope,
      payload: {
        ...validEnvelope.payload,
        apiToken: 'notarp-synthetic-token-do-not-leak',
      },
    }

    expect(nfseProcessingEnvelopeV1Schema.safeParse(envelope).success).toBe(false)
  })
})
