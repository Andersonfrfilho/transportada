/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseServiceInvoiceStatus } from '../../database/nfse.schema.js'

export const NFSE_INVOICE_ACTION = {
  cancel: 'cancel',
  confirmCancellation: 'confirmCancellation',
  discard: 'discard',
  issue: 'issue',
} as const

export type NfseInvoiceAction = (typeof NFSE_INVOICE_ACTION)[keyof typeof NFSE_INVOICE_ACTION]

export const NFSE_TRANSITION_BLOCK = {
  alreadyAuthorized: 'NFSE_INVOICE_ALREADY_AUTHORIZED',
  alreadyCancelled: 'NFSE_INVOICE_ALREADY_CANCELLED',
  alreadyDiscarded: 'NFSE_INVOICE_ALREADY_DISCARDED',
  cancellationInFlight: 'NFSE_INVOICE_CANCELLATION_IN_FLIGHT',
  inFlight: 'NFSE_INVOICE_IN_FLIGHT',
  notAuthorized: 'NFSE_INVOICE_NOT_AUTHORIZED',
  pendingAuthorization: 'NFSE_INVOICE_PENDING_AUTHORIZATION',
} as const

export type NfseTransitionBlock = (typeof NFSE_TRANSITION_BLOCK)[keyof typeof NFSE_TRANSITION_BLOCK]

export type NfseInvoiceTransition =
  | { readonly allowed: true; readonly nextStatus: NfseServiceInvoiceStatus }
  | { readonly allowed: false; readonly reason: NfseTransitionBlock }

const ISSUE_TRANSITIONS: Readonly<Record<NfseServiceInvoiceStatus, NfseInvoiceTransition>> = {
  authorized: { allowed: false, reason: NFSE_TRANSITION_BLOCK.alreadyAuthorized },
  cancellation_requested: { allowed: false, reason: NFSE_TRANSITION_BLOCK.cancellationInFlight },
  cancelled: { allowed: false, reason: NFSE_TRANSITION_BLOCK.alreadyCancelled },
  discarded: { allowed: false, reason: NFSE_TRANSITION_BLOCK.alreadyDiscarded },
  failed: { allowed: true, nextStatus: 'issuing' },
  issuing: { allowed: false, reason: NFSE_TRANSITION_BLOCK.inFlight },
  pending_authorization: { allowed: false, reason: NFSE_TRANSITION_BLOCK.pendingAuthorization },
  rejected: { allowed: true, nextStatus: 'issuing' },
  requested: { allowed: true, nextStatus: 'issuing' },
}

/**
 * Cancelar leva a nota a `cancellation_requested`, não a `cancelled`: quem cancela um documento
 * fiscal é a prefeitura, e ela responde depois. O estado intermediário é o que a tela mostra
 * entre o clique e a confirmação — sem ele a nota seguiria dizendo `authorized`.
 */
const CANCEL_TRANSITIONS: Readonly<Record<NfseServiceInvoiceStatus, NfseInvoiceTransition>> = {
  authorized: { allowed: true, nextStatus: 'cancellation_requested' },
  cancellation_requested: { allowed: false, reason: NFSE_TRANSITION_BLOCK.cancellationInFlight },
  cancelled: { allowed: false, reason: NFSE_TRANSITION_BLOCK.alreadyCancelled },
  discarded: { allowed: false, reason: NFSE_TRANSITION_BLOCK.alreadyDiscarded },
  failed: { allowed: false, reason: NFSE_TRANSITION_BLOCK.notAuthorized },
  issuing: { allowed: false, reason: NFSE_TRANSITION_BLOCK.notAuthorized },
  pending_authorization: { allowed: false, reason: NFSE_TRANSITION_BLOCK.pendingAuthorization },
  rejected: { allowed: false, reason: NFSE_TRANSITION_BLOCK.notAuthorized },
  requested: { allowed: false, reason: NFSE_TRANSITION_BLOCK.notAuthorized },
}

/**
 * O write-back da prefeitura, guardado pela mesma tabela: só a nota com cancelamento em voo
 * pode virar `cancelled`. Chegar `cancelled` sobre qualquer outro estado é resposta fora de ordem.
 */
const CONFIRM_CANCELLATION_TRANSITIONS: Readonly<
  Record<NfseServiceInvoiceStatus, NfseInvoiceTransition>
> = {
  authorized: { allowed: false, reason: NFSE_TRANSITION_BLOCK.notAuthorized },
  cancellation_requested: { allowed: true, nextStatus: 'cancelled' },
  cancelled: { allowed: false, reason: NFSE_TRANSITION_BLOCK.alreadyCancelled },
  discarded: { allowed: false, reason: NFSE_TRANSITION_BLOCK.alreadyDiscarded },
  failed: { allowed: false, reason: NFSE_TRANSITION_BLOCK.notAuthorized },
  issuing: { allowed: false, reason: NFSE_TRANSITION_BLOCK.notAuthorized },
  pending_authorization: { allowed: false, reason: NFSE_TRANSITION_BLOCK.pendingAuthorization },
  rejected: { allowed: false, reason: NFSE_TRANSITION_BLOCK.notAuthorized },
  requested: { allowed: false, reason: NFSE_TRANSITION_BLOCK.notAuthorized },
}

/**
 * Descartar só existe para o que nunca chegou a existir fiscalmente: uma rejeição ou falha de
 * transmissão. Qualquer outro estado — em voo, pendente, autorizado, já liquidado — bloqueia.
 */
const DISCARD_TRANSITIONS: Readonly<Record<NfseServiceInvoiceStatus, NfseInvoiceTransition>> = {
  authorized: { allowed: false, reason: NFSE_TRANSITION_BLOCK.alreadyAuthorized },
  cancellation_requested: { allowed: false, reason: NFSE_TRANSITION_BLOCK.cancellationInFlight },
  cancelled: { allowed: false, reason: NFSE_TRANSITION_BLOCK.alreadyCancelled },
  discarded: { allowed: false, reason: NFSE_TRANSITION_BLOCK.alreadyDiscarded },
  failed: { allowed: true, nextStatus: 'discarded' },
  issuing: { allowed: false, reason: NFSE_TRANSITION_BLOCK.inFlight },
  pending_authorization: { allowed: false, reason: NFSE_TRANSITION_BLOCK.pendingAuthorization },
  rejected: { allowed: true, nextStatus: 'discarded' },
  requested: { allowed: false, reason: NFSE_TRANSITION_BLOCK.inFlight },
}

export function checkNfseInvoiceTransition({
  action,
  status,
}: {
  readonly action: NfseInvoiceAction
  readonly status: NfseServiceInvoiceStatus
}): NfseInvoiceTransition {
  if (action === NFSE_INVOICE_ACTION.cancel) return CANCEL_TRANSITIONS[status]
  if (action === NFSE_INVOICE_ACTION.confirmCancellation) {
    return CONFIRM_CANCELLATION_TRANSITIONS[status]
  }
  if (action === NFSE_INVOICE_ACTION.discard) return DISCARD_TRANSITIONS[status]

  return ISSUE_TRANSITIONS[status]
}
