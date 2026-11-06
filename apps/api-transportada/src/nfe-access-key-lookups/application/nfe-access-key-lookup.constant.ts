/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeAccessKeyLookupReason } from '../../database/nfe.schema.js'

export const ACCESS_KEY_LOOKUP_REQUEST_OPERATION = 'nfe-access-key-lookup.request'
export const ACCESS_KEY_LOOKUP_IDEMPOTENCY_PREFIX = 'nfe-access-key-lookup'
export const ACCESS_KEY_LOOKUP_QUEUED_STATUS = 'queued'
export const ACCESS_KEY_LOOKUP_IMPORT_AGGREGATE_TYPE = 'nfe_import'

/** Teto de buscas ativas por empresa: o que passa disso espera a fila andar, em vez de crescer sem fim. */
export const ACCESS_KEY_LOOKUP_ACTIVE_LIMIT = 500
export const ACCESS_KEY_LOOKUP_REQUESTED_EVENT = 'transportada.nfe.access-key.requested'

/** RF8: a recusa definitiva de uma chave vale por 24 h; depois, perguntar de novo é permitido. */
export const ACCESS_KEY_REFUSAL_WINDOW_MS = 24 * 60 * 60 * 1000

/** Só estes motivos são resposta da SEFAZ sobre a chave; os demais são falha de quem perguntou. */
export const DEFINITIVE_REFUSAL_REASONS = [
  'not_interested',
  'not_found',
  'expired',
  'cancelled',
  'denied',
] as const satisfies readonly NfeAccessKeyLookupReason[]
