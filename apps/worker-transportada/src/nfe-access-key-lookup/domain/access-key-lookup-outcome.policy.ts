/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeAccessKeyLookupReason } from '../../database/nfe.schema.js'
import { SEFAZ_UNAVAILABLE_REASON } from './nfe-access-key-lookup.constant.js'
import type {
  AccessKeyLookupGatewayResult,
  AccessKeyLookupOutcome,
} from './nfe-access-key-lookup.types.js'

const COMPLETE_DOCUMENT_SCHEMA = 'procNFe'
const SUMMARY_DOCUMENT_SCHEMA = 'resNFe'
const BUDGET_BLOCK_CSTAT = '656'

const REFUSAL_REASON_BY_CSTAT: Readonly<Record<string, NfeAccessKeyLookupReason>> = {
  '217': 'not_found',
  '593': 'certificate_mismatch',
  '632': 'expired',
  '640': 'not_interested',
  '653': 'cancelled',
  '654': 'denied',
}

export function resolveAccessKeyLookupOutcome(
  result: AccessKeyLookupGatewayResult,
): AccessKeyLookupOutcome {
  if (result.kind === 'unavailable') {
    return { status: 'failed', reason: SEFAZ_UNAVAILABLE_REASON }
  }
  if (result.kind === 'not-found') {
    return { status: 'refused', reason: 'not_found' }
  }
  if (result.kind === 'document') {
    return resolveDocumentOutcome(result.item.schema)
  }
  return resolveRejectionOutcome(result.cStat)
}

function resolveDocumentOutcome(schema: string): AccessKeyLookupOutcome {
  if (schema === COMPLETE_DOCUMENT_SCHEMA) return { status: 'imported-candidate' }
  if (schema === SUMMARY_DOCUMENT_SCHEMA) return { status: 'refused', reason: 'summary_only' }
  return { status: 'failed', reason: SEFAZ_UNAVAILABLE_REASON, unmapped: true }
}

function resolveRejectionOutcome(cStat: string): AccessKeyLookupOutcome {
  if (cStat === BUDGET_BLOCK_CSTAT) return { status: 'waiting' }
  const reason = REFUSAL_REASON_BY_CSTAT[cStat]
  if (reason !== undefined) return { status: 'refused', reason }
  return { status: 'failed', reason: SEFAZ_UNAVAILABLE_REASON, cStat, unmapped: true }
}
