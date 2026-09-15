/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeDocumentStatus, NfeEventOrigin } from '../../database/nfe.schema.js'

/** D21 — a única origem cujo evento muda status: a distribuição, que é a SEFAZ quem entrega. */
export const NFE_EVENT_AUTOMATIC_ORIGIN = 'automatic' as const satisfies NfeEventOrigin

/** A única situação da NF-e sobre a qual um documento novo pode nascer. */
export const NFE_DOCUMENT_AUTHORIZED_STATUS = 'authorized' as const satisfies NfeDocumentStatus

/** D1 — só estes `tpEvento` mudam a situação da nota; os demais só gravam em `nfe_events`. */
export const NFE_STATUS_CHANGING_EVENT_TYPES = {
  '110111': 'cancelled',
  '110112': 'cancelled',
} as const satisfies Record<string, NfeDocumentStatus>

/** Código estável do erro de invariante da escrita de status (`nfe-document-status.error.ts`). */
export const NFE_DOCUMENT_STATUS_INVARIANT_BROKEN = 'NFE_DOCUMENT_STATUS_INVARIANT_BROKEN'

/** D8 — prefixo do lock; colisão de hash com outro advisory lock só gera espera, nunca erro. */
export const NFE_DOCUMENT_STATUS_LOCK_NAMESPACE = 'nfe-document-status'

/** D2 — o evento só vale se a SEFAZ o registrou (MOC 7.0, tabela de códigos do `retEvento`). */
export const NFE_EVENT_REGISTERED_STATUS_CODES = ['135', '136', '155'] as const

/**
 * D4 — máquina de estados: chave é o destino, valor são as únicas origens de onde ele é
 * alcançável. `cancelled`/`denied` nunca aparecem como chave de outro destino — são terminais.
 */
export const ALLOWED_ORIGIN_STATUSES: Partial<
  Record<NfeDocumentStatus, readonly NfeDocumentStatus[]>
> = {
  cancelled: [NFE_DOCUMENT_AUTHORIZED_STATUS, 'unsigned'],
  denied: ['unsigned'],
}
