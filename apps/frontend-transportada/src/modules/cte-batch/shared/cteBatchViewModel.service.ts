/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CteBatchEventListPage,
  CteBatchListPage,
  CteBatchSummary,
} from './cteBatchClient.service'

export type CteBatchViewModel = Readonly<{
  batches?: CteBatchListPage['items']
  canManageBatches: boolean
  canSubmitBatches: boolean
  canSubmitSelectedBatch?: boolean
  events?: CteBatchEventListPage['items']
  selectedBatch?: CteBatchSummary
  selectedBatchId?: string
  status: 'draft' | 'empty' | 'error' | 'forbidden' | 'loading' | 'processing' | 'terminal'
}>

type ViewModelInput = Readonly<{
  batches?: CteBatchListPage
  events?: CteBatchEventListPage
  permissions: readonly string[]
  selectedBatch?: CteBatchSummary
  status: 'error' | 'loading' | 'success'
}>

const CTE_MANAGE = 'cte.manage'
const CTE_SUBMIT = 'cte.submit'

function statusFromSelectedBatch(
  selectedBatch: CteBatchSummary | undefined,
): CteBatchViewModel['status'] {
  if (selectedBatch === undefined) return 'empty'
  if (selectedBatch.status === 'draft') return 'draft'
  if (selectedBatch.status === 'submitted' || selectedBatch.status === 'in_flight') {
    return 'processing'
  }
  return 'terminal'
}

export function createCteBatchViewModel(input: ViewModelInput): CteBatchViewModel {
  const canManageBatches = input.permissions.includes(CTE_MANAGE)
  const canSubmitBatches = input.permissions.includes(CTE_SUBMIT)

  if (!canManageBatches && !canSubmitBatches) {
    return { canManageBatches, canSubmitBatches, status: 'forbidden' }
  }
  if (input.status !== 'success') {
    return { canManageBatches, canSubmitBatches, status: input.status }
  }

  const batches = input.batches?.items ?? []
  const events = input.events?.items ?? []
  if (batches.length === 0 && input.selectedBatch === undefined) {
    return { canManageBatches, canSubmitBatches, status: 'empty' }
  }

  const selectedBatch = input.selectedBatch ?? batches[0]
  const canSubmitSelectedBatch = canSubmitBatches && selectedBatch?.status === 'draft'

  return {
    ...(batches.length === 0 ? {} : { batches }),
    canManageBatches,
    canSubmitBatches,
    canSubmitSelectedBatch,
    ...(events.length === 0 ? {} : { events }),
    ...(selectedBatch === undefined ? {} : { selectedBatch }),
    ...(selectedBatch === undefined ? {} : { selectedBatchId: selectedBatch.id }),
    status: statusFromSelectedBatch(selectedBatch),
  }
}
