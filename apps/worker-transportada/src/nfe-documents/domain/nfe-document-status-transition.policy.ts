/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeDocumentStatus } from '../../database/nfe.schema.js'

import {
  ALLOWED_ORIGIN_STATUSES,
  NFE_EVENT_REGISTERED_STATUS_CODES,
  NFE_STATUS_CHANGING_EVENT_TYPES,
} from './nfe-document-status.constant.js'

export type NfeDocumentStatusNotAppliedReason = 'missing-status-code' | 'status-code-not-registered'

export type NfeDocumentStatusChangeResolution =
  | { readonly kind: 'change'; readonly to: NfeDocumentStatus }
  | { readonly kind: 'ignore' }
  | { readonly kind: 'not-applied'; readonly reason: NfeDocumentStatusNotAppliedReason }

const EVENT_TYPE_TARGETS: Record<string, NfeDocumentStatus | undefined> =
  NFE_STATUS_CHANGING_EVENT_TYPES
const REGISTERED_STATUS_CODES: readonly string[] = NFE_EVENT_REGISTERED_STATUS_CODES

/** D1, D2 — só cancela quando o tipo muda status e a SEFAZ registrou o evento com um `cStat` aceito. */
export function resolveEventStatusChange(input: {
  readonly eventType: string
  readonly statusCode: string | undefined
}): NfeDocumentStatusChangeResolution {
  const to = EVENT_TYPE_TARGETS[input.eventType]
  if (to === undefined) return { kind: 'ignore' }

  if (input.statusCode === undefined) return { kind: 'not-applied', reason: 'missing-status-code' }
  if (!REGISTERED_STATUS_CODES.includes(input.statusCode))
    return { kind: 'not-applied', reason: 'status-code-not-registered' }

  return { kind: 'change', to }
}

/** D3 — o resumo (`resNFe.cSitNFe`) só cancela ou denega; `'1'` e ausente (`''`) não têm efeito. */
export function resolveSummaryStatusChange(input: {
  readonly situation: string
}): NfeDocumentStatusChangeResolution {
  if (input.situation === '2') return { kind: 'change', to: 'cancelled' }
  if (input.situation === '3') return { kind: 'change', to: 'denied' }

  return { kind: 'ignore' }
}

/** D4 — o `WHERE` do `UPDATE` usa esta mesma tabela: `cancelled`/`denied` nunca são origem válida. */
export function isStatusTransitionAllowed(input: {
  readonly from: NfeDocumentStatus
  readonly to: NfeDocumentStatus
}): boolean {
  return (ALLOWED_ORIGIN_STATUSES[input.to] ?? []).includes(input.from)
}
