/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeManifestStatus } from '../../database/mdfe.schema.js'

export const MDFE_MANIFEST_ACTION = {
  cancel: 'cancel',
  close: 'close',
  discard: 'discard',
  issue: 'issue',
} as const

export type MdfeManifestAction = (typeof MDFE_MANIFEST_ACTION)[keyof typeof MDFE_MANIFEST_ACTION]

export const MDFE_TRANSITION_BLOCK = {
  alreadyCancelled: 'MDFE_MANIFEST_ALREADY_CANCELLED',
  alreadyClosed: 'MDFE_MANIFEST_ALREADY_CLOSED',
  alreadyDiscarded: 'MDFE_MANIFEST_ALREADY_DISCARDED',
  inFlight: 'MDFE_MANIFEST_IN_FLIGHT',
  notAuthorized: 'MDFE_MANIFEST_NOT_AUTHORIZED',
  notDiscardable: 'MDFE_MANIFEST_NOT_DISCARDABLE',
  notIssuable: 'MDFE_MANIFEST_NOT_ISSUABLE',
  windowExpired: 'MDFE_MANIFEST_CANCELLATION_WINDOW_EXPIRED',
} as const

export type MdfeTransitionBlock = (typeof MDFE_TRANSITION_BLOCK)[keyof typeof MDFE_TRANSITION_BLOCK]

/** Prazo de cancelamento do MDF-e; empresa pode encurtar, nunca alargar por conta própria. */
export const MDFE_CANCELLATION_WINDOW_HOURS = 24

export const MDFE_CANCELLATION_JUSTIFICATION_MIN_LENGTH = 15

const HOUR_IN_MILLISECONDS = 60 * 60 * 1000

export type MdfeManifestTransition =
  | { readonly allowed: true; readonly nextStatus: MdfeManifestStatus }
  | { readonly allowed: false; readonly reason: MdfeTransitionBlock }

export type CheckManifestTransitionParams = {
  readonly action: MdfeManifestAction
  readonly authorizedAt: string | null
  readonly cancellationWindowHours?: number
  readonly now: Date
  readonly status: MdfeManifestStatus
}

/** ADR-0016: `draft → issuing → authorized → closed`, com `rejected` e `cancelled` como saídas. */
export function checkManifestTransition({
  action,
  authorizedAt,
  cancellationWindowHours = MDFE_CANCELLATION_WINDOW_HOURS,
  now,
  status,
}: CheckManifestTransitionParams): MdfeManifestTransition {
  if (action === MDFE_MANIFEST_ACTION.issue) return checkIssue(status)
  if (action === MDFE_MANIFEST_ACTION.close) return checkClose(status)
  if (action === MDFE_MANIFEST_ACTION.discard) return checkManifestDiscard(status)

  return checkCancel({ authorizedAt, cancellationWindowHours, now, status })
}

/** O `UPDATE` do descarte repete esta lista no `WHERE` — SQL e domínio recusam os mesmos estados. */
export const MDFE_DISCARDABLE_STATUSES = ['draft', 'rejected'] as const

/**
 * ADR-0017: descartar é o que devolve o CT-e ao pool. Só vale antes de a SEFAZ decidir — depois
 * disso o caminho é o evento 110111, e um manifesto em voo pode voltar autorizado.
 */
export function checkManifestDiscard(status: MdfeManifestStatus): MdfeManifestTransition {
  if (isDiscardableStatus(status)) {
    return { allowed: true, nextStatus: 'discarded' }
  }
  if (status === 'issuing') return { allowed: false, reason: MDFE_TRANSITION_BLOCK.inFlight }
  if (status === 'discarded') {
    return { allowed: false, reason: MDFE_TRANSITION_BLOCK.alreadyDiscarded }
  }

  return { allowed: false, reason: MDFE_TRANSITION_BLOCK.notDiscardable }
}

function isDiscardableStatus(status: MdfeManifestStatus): boolean {
  return MDFE_DISCARDABLE_STATUSES.some((discardable) => discardable === status)
}

export function isCancellationJustificationValid(justification: string): boolean {
  return justification.trim().length >= MDFE_CANCELLATION_JUSTIFICATION_MIN_LENGTH
}

function checkIssue(status: MdfeManifestStatus): MdfeManifestTransition {
  if (status === 'draft' || status === 'rejected') return { allowed: true, nextStatus: 'issuing' }
  if (status === 'issuing') return { allowed: false, reason: MDFE_TRANSITION_BLOCK.inFlight }

  return { allowed: false, reason: MDFE_TRANSITION_BLOCK.notIssuable }
}

function checkClose(status: MdfeManifestStatus): MdfeManifestTransition {
  if (status === 'authorized') return { allowed: true, nextStatus: 'closed' }

  return { allowed: false, reason: resolveTerminalBlock(status) }
}

type CheckCancelParams = {
  readonly authorizedAt: string | null
  readonly cancellationWindowHours: number
  readonly now: Date
  readonly status: MdfeManifestStatus
}

function checkCancel({
  authorizedAt,
  cancellationWindowHours,
  now,
  status,
}: CheckCancelParams): MdfeManifestTransition {
  if (status !== 'authorized') return { allowed: false, reason: resolveTerminalBlock(status) }
  if (authorizedAt === null) {
    return { allowed: false, reason: MDFE_TRANSITION_BLOCK.notAuthorized }
  }

  const elapsed = now.getTime() - Date.parse(authorizedAt)
  if (elapsed > cancellationWindowHours * HOUR_IN_MILLISECONDS) {
    return { allowed: false, reason: MDFE_TRANSITION_BLOCK.windowExpired }
  }

  return { allowed: true, nextStatus: 'cancelled' }
}

/** Encerrado nunca cancela e cancelado não volta — a SEFAZ recusa o evento depois de qualquer um. */
function resolveTerminalBlock(status: MdfeManifestStatus): MdfeTransitionBlock {
  if (status === 'closed') return MDFE_TRANSITION_BLOCK.alreadyClosed
  if (status === 'cancelled') return MDFE_TRANSITION_BLOCK.alreadyCancelled
  if (status === 'discarded') return MDFE_TRANSITION_BLOCK.alreadyDiscarded

  return MDFE_TRANSITION_BLOCK.notAuthorized
}
