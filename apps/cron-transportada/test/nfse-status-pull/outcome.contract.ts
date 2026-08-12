/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveNfseReconciliationDecision,
  type NfseProviderStatusFacts,
} from '../../src/nfse-status-pull/domain/nfse-reconciliation-outcome.policy.js'

const AUTHORIZED_DOCUMENT = {
  authorizedAt: '2026-08-12T13:45:00.000Z',
  fiscalNumber: '4321',
  providerDocumentId: '900123456',
  verificationCode: 'VER-0001',
} as const

const AUTHORIZED: NfseProviderStatusFacts = {
  document: AUTHORIZED_DOCUMENT,
  status: 'authorized',
}

const REJECTED: NfseProviderStatusFacts = {
  rejection: { code: 'E320', message: 'Item da lista de servicos incompativel com o CNAE' },
  status: 'rejected',
}

const CANCELLED: NfseProviderStatusFacts = {
  cancelledAt: '2026-08-12T18:00:00.000Z',
  status: 'cancelled',
}

const PENDING: NfseProviderStatusFacts = { status: 'pending' }

const TRANSPORT_ERROR: NfseProviderStatusFacts = { cause: 'timeout', status: 'error' }

describe('NFS-e reconciliation outcome from a pending invoice', () => {
  test('authorizes when the city says authorized', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: AUTHORIZED,
        storedStatus: 'pending_authorization',
      }),
    ).toEqual({ document: AUTHORIZED_DOCUMENT, kind: 'authorize' })
  })

  /** Autorização sem número ou código de verificação não é documento arquivável. */
  test('defers an authorization that carries no document', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: { status: 'authorized' },
        storedStatus: 'pending_authorization',
      }),
    ).toEqual({ cause: 'malformed_response', kind: 'defer' })
  })

  test('records the rejection with the city code and message', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: REJECTED,
        storedStatus: 'pending_authorization',
      }),
    ).toEqual({
      errorCode: 'E320',
      errorMessage: 'Item da lista de servicos incompativel com o CNAE',
      kind: 'reject',
    })
  })

  test('defers a rejection that carries no code', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: { status: 'rejected' },
        storedStatus: 'pending_authorization',
      }),
    ).toEqual({ cause: 'malformed_response', kind: 'defer' })
  })

  test('reschedules while the city is still processing', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: PENDING,
        storedStatus: 'pending_authorization',
      }),
    ).toEqual({ cause: 'pending', kind: 'reschedule' })
  })

  /** Cancelada sem cancelamento pedido é inconsistência: nunca liquida a nota por conta própria. */
  test('reschedules a cancellation that nobody requested', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: CANCELLED,
        storedStatus: 'pending_authorization',
      }),
    ).toEqual({ cause: 'unexpected_provider_status', kind: 'reschedule' })
  })

  test('defers on transport failure, carrying the stable cause', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: TRANSPORT_ERROR,
        storedStatus: 'pending_authorization',
      }),
    ).toEqual({ cause: 'timeout', kind: 'defer' })
  })

  test('defers an error with no cause under a stable fallback', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: { status: 'error' },
        storedStatus: 'pending_authorization',
      }),
    ).toEqual({ cause: 'transport_failure', kind: 'defer' })
  })
})

describe('NFS-e reconciliation outcome from an invoice awaiting cancellation', () => {
  test('confirms the cancellation the city acknowledged', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: CANCELLED,
        storedStatus: 'cancellation_requested',
      }),
    ).toEqual({ cancelledAt: '2026-08-12T18:00:00.000Z', kind: 'confirmCancellation' })
  })

  test('confirms a cancellation with no timestamp', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: { status: 'cancelled' },
        storedStatus: 'cancellation_requested',
      }),
    ).toEqual({ kind: 'confirmCancellation' })
  })

  /** Ainda autorizada lá fora: o pedido de cancelamento não foi processado, e a nota espera. */
  test('reschedules while the city still reports the note as authorized', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: AUTHORIZED,
        storedStatus: 'cancellation_requested',
      }),
    ).toEqual({ cause: 'cancellation_pending', kind: 'reschedule' })
  })

  test('never records a rejection over a note that was already authorized', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: REJECTED,
        storedStatus: 'cancellation_requested',
      }),
    ).toEqual({ cause: 'unexpected_provider_status', kind: 'reschedule' })
  })

  test('reschedules while the city is still processing the cancellation', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: PENDING,
        storedStatus: 'cancellation_requested',
      }),
    ).toEqual({ cause: 'pending', kind: 'reschedule' })
  })

  test('defers on transport failure without settling the cancellation', () => {
    expect(
      resolveNfseReconciliationDecision({
        provider: TRANSPORT_ERROR,
        storedStatus: 'cancellation_requested',
      }),
    ).toEqual({ cause: 'timeout', kind: 'defer' })
  })
})
