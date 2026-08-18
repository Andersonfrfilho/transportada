/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { NfseServiceInvoiceStatus } from '../../src/database/nfse.schema.js'
import {
  NFSE_INVOICE_ACTION,
  NFSE_TRANSITION_BLOCK,
  checkNfseInvoiceTransition,
} from '../../src/nfse-invoices/domain/nfse-invoice-state.policy.js'

function issueFrom(
  status: NfseServiceInvoiceStatus,
): ReturnType<typeof checkNfseInvoiceTransition> {
  return checkNfseInvoiceTransition({ action: NFSE_INVOICE_ACTION.issue, status })
}

function cancelFrom(
  status: NfseServiceInvoiceStatus,
): ReturnType<typeof checkNfseInvoiceTransition> {
  return checkNfseInvoiceTransition({ action: NFSE_INVOICE_ACTION.cancel, status })
}

function confirmCancellationFrom(
  status: NfseServiceInvoiceStatus,
): ReturnType<typeof checkNfseInvoiceTransition> {
  return checkNfseInvoiceTransition({ action: NFSE_INVOICE_ACTION.confirmCancellation, status })
}

function discardFrom(
  status: NfseServiceInvoiceStatus,
): ReturnType<typeof checkNfseInvoiceTransition> {
  return checkNfseInvoiceTransition({ action: NFSE_INVOICE_ACTION.discard, status })
}

describe('NFS-e invoice state contract', () => {
  test('transmits a fresh invoice and retries one the city refused', () => {
    for (const status of ['requested', 'rejected', 'failed'] as const) {
      expect(issueFrom(status)).toEqual({ allowed: true, nextStatus: 'issuing' })
    }
  })

  test('never transmits twice over a request already in flight', () => {
    expect(issueFrom('issuing')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.inFlight,
    })
  })

  test('holds the invoice the city accepted but has not authorized yet', () => {
    expect(issueFrom('pending_authorization')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.pendingAuthorization,
    })
    // Cancelar o que a prefeitura ainda não autorizou não existe: não há número para cancelar.
    expect(cancelFrom('pending_authorization')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.pendingAuthorization,
    })
  })

  test('refuses to reissue over an authorized invoice', () => {
    expect(issueFrom('authorized')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.alreadyAuthorized,
    })
  })

  /**
   * O pedido de cancelamento tem a mesma assincronia da autorização: a prefeitura aceita agora e
   * confirma depois. Sem o estado intermediário a tela seguiria dizendo `authorized`.
   */
  test('moves an authorized invoice to cancellation_requested, never straight to cancelled', () => {
    expect(cancelFrom('authorized')).toEqual({
      allowed: true,
      nextStatus: 'cancellation_requested',
    })
  })

  test('only the write-back settles a requested cancellation', () => {
    expect(confirmCancellationFrom('cancellation_requested')).toEqual({
      allowed: true,
      nextStatus: 'cancelled',
    })
    // Resposta fora de ordem: confirmar cancelamento de quem nunca pediu não pode passar.
    expect(confirmCancellationFrom('authorized')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.notAuthorized,
    })
  })

  /** Cancelamento em voo não volta atrás nem aceita segundo pedido — só a prefeitura o resolve. */
  test('refuses every action over an invoice whose cancellation is in flight', () => {
    for (const transition of [
      cancelFrom('cancellation_requested'),
      issueFrom('cancellation_requested'),
    ]) {
      expect(transition).toEqual({
        allowed: false,
        reason: NFSE_TRANSITION_BLOCK.cancellationInFlight,
      })
    }
  })

  test('refuses both actions over a cancelled invoice', () => {
    expect(issueFrom('cancelled')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.alreadyCancelled,
    })
    expect(cancelFrom('cancelled')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.alreadyCancelled,
    })
  })

  test('refuses to cancel what the city never authorized', () => {
    for (const status of ['requested', 'issuing', 'rejected', 'failed'] as const) {
      expect(cancelFrom(status)).toEqual({
        allowed: false,
        reason: NFSE_TRANSITION_BLOCK.notAuthorized,
      })
    }
  })

  /**
   * Descartar existe só para o documento que nunca teve existência fiscal: a prefeitura recusou
   * (`rejected`) ou as tentativas se esgotaram (`failed`). Autorizada se resolve por cancelamento.
   */
  test('discards only what never existed fiscally', () => {
    for (const status of ['rejected', 'failed'] as const) {
      expect(discardFrom(status)).toEqual({ allowed: true, nextStatus: 'discarded' })
    }
  })

  test('refuses to discard anything mid-flight, pending, authorized or already settled', () => {
    expect(discardFrom('requested')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.inFlight,
    })
    expect(discardFrom('issuing')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.inFlight,
    })
    expect(discardFrom('pending_authorization')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.pendingAuthorization,
    })
    expect(discardFrom('authorized')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.alreadyAuthorized,
    })
    expect(discardFrom('cancellation_requested')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.cancellationInFlight,
    })
    expect(discardFrom('cancelled')).toEqual({
      allowed: false,
      reason: NFSE_TRANSITION_BLOCK.alreadyCancelled,
    })
  })

  /** `discarded` é terminal: nenhuma das quatro ações reabre uma fatura descartada. */
  test('refuses every action over a discarded invoice', () => {
    for (const transition of [
      issueFrom('discarded'),
      cancelFrom('discarded'),
      confirmCancellationFrom('discarded'),
      discardFrom('discarded'),
    ]) {
      expect(transition).toEqual({
        allowed: false,
        reason: NFSE_TRANSITION_BLOCK.alreadyDiscarded,
      })
    }
  })
})
