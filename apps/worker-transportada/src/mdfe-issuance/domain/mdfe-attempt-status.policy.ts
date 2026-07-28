/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeIssuanceStatus } from '../../database/mdfe-issuance-execution.schema.js'

/** Reentrega não pode sobrescrever uma tentativa já liquidada com um resultado antigo. */
export const MDFE_NON_SETTLED_ATTEMPT_STATUSES: readonly MdfeIssuanceStatus[] = [
  'pending',
  'in_flight',
  'retry_scheduled',
  'reconciliation_required',
]

export function isSettledMdfeIssuanceStatus(status: string): boolean {
  return !MDFE_NON_SETTLED_ATTEMPT_STATUSES.includes(status as MdfeIssuanceStatus)
}
