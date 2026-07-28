/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteIssuanceStatus } from './cteIssuanceClient.service'

export const CTE_ISSUANCE_POLL_INTERVAL_MS = 5_000

const IN_FLIGHT_STATUSES: readonly string[] = ['requested', 'retry_scheduled']

export type CteIssuanceQueryPlan = Readonly<{
  documentsEnabled: boolean
  issuanceEnabled: boolean
  refetchInterval: false | number
}>

type QueryPlanInput = Readonly<{
  batchId?: string | undefined
  batchItemId?: string | undefined
  canSubmitCte: boolean
  status?: CteIssuanceStatus | undefined
}>

export function createCteIssuanceQueryPlan(input: QueryPlanInput): CteIssuanceQueryPlan {
  const issuanceEnabled =
    input.canSubmitCte && input.batchId !== undefined && input.batchItemId !== undefined

  return {
    documentsEnabled: issuanceEnabled && input.status === 'authorized',
    issuanceEnabled,
    refetchInterval:
      issuanceEnabled && IN_FLIGHT_STATUSES.includes(input.status ?? '')
        ? CTE_ISSUANCE_POLL_INTERVAL_MS
        : false,
  }
}
