/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const CTE_ISSUANCE_ITEM_STATUSES = [
  'pending',
  'in_flight',
  'authorized',
  'rejected',
  'failed',
  'retry_scheduled',
  'reconciliation_required',
  'cancelled',
] as const

export type CteIssuanceItemStatus = (typeof CTE_ISSUANCE_ITEM_STATUSES)[number]

export const CTE_BATCH_PROGRESS_STATUSES = ['submitted', 'in_flight', 'done', 'error'] as const

export type CteBatchProgressStatus = (typeof CTE_BATCH_PROGRESS_STATUSES)[number]

const SETTLED_STATUSES: ReadonlySet<CteIssuanceItemStatus> = new Set([
  'authorized',
  'rejected',
  'failed',
  'reconciliation_required',
  'cancelled',
])

const SUCCESSFUL_STATUSES: ReadonlySet<CteIssuanceItemStatus> = new Set(['authorized', 'cancelled'])

export function isSettledCteIssuanceStatus(status: CteIssuanceItemStatus): boolean {
  return SETTLED_STATUSES.has(status)
}

export function resolveCteBatchStatus(
  itemStatuses: readonly CteIssuanceItemStatus[],
): CteBatchProgressStatus {
  if (itemStatuses.length === 0) {
    return 'submitted'
  }

  if (itemStatuses.some((status) => !SETTLED_STATUSES.has(status))) {
    return 'in_flight'
  }

  return itemStatuses.every((status) => SUCCESSFUL_STATUSES.has(status)) ? 'done' : 'error'
}
