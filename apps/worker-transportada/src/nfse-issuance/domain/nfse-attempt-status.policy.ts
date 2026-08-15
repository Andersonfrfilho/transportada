/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseIssuanceStatus } from '../../database/nfse-issuance-execution.schema.js'

/**
 * A tentativa liquidada não volta atrás: uma reentrega tardia não pode reabrir o que a prefeitura
 * já respondeu. `accepted` fica de fora porque a autorização ainda vai ser confirmada por consulta.
 */
export const NFSE_NON_SETTLED_ATTEMPT_STATUSES: readonly NfseIssuanceStatus[] = [
  'pending',
  'in_flight',
  'accepted',
  'retry_scheduled',
  'reconciliation_required',
]

export function isSettledNfseIssuanceStatus(status: string): boolean {
  return !NFSE_NON_SETTLED_ATTEMPT_STATUSES.includes(status as NfseIssuanceStatus)
}
