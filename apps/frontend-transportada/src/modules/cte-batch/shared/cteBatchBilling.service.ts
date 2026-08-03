/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteBatchStatus, CteBatchSummary } from './cteBatchClient.service'
import { CTE_BATCH_ITEM_STATUS } from './cteBatchItem.types'
import type { CteItemAmounts } from './cteBatchItemSelection.service'

export const BILLING_CREATE_PERMISSION = 'billing.create'

/** Rascunho e transmissão em curso ainda não têm CT-e autorizado — não há o que faturar. */
const BILLABLE_BATCH_STATUSES: readonly CteBatchStatus[] = ['done', 'error', 'submitted']

export const CTE_BILLING_BLOCK_REASON = {
  MISSING_DOCUMENT: 'missing_document',
  NOT_AUTHORIZED: 'not_authorized',
  UNKNOWN_ITEM: 'unknown_item',
} as const
export type CteBillingBlockReason =
  (typeof CTE_BILLING_BLOCK_REASON)[keyof typeof CTE_BILLING_BLOCK_REASON]

export type BillableCte = Readonly<{ fiscalDocumentId: string; itemId: string }>

export type BlockedCteForBilling = Readonly<{ itemId: string; reason: CteBillingBlockReason }>

export type CteBillingSelection = Readonly<{
  billable: readonly BillableCte[]
  blocked: readonly BlockedCteForBilling[]
}>

type CteBillingClassification =
  | Readonly<{ fiscalDocumentId: string }>
  | Readonly<{ reason: CteBillingBlockReason }>

function classify(amounts: CteItemAmounts | undefined): CteBillingClassification {
  if (amounts === undefined) return { reason: CTE_BILLING_BLOCK_REASON.UNKNOWN_ITEM }
  if (amounts.status !== CTE_BATCH_ITEM_STATUS.AUTHORIZED) {
    return { reason: CTE_BILLING_BLOCK_REASON.NOT_AUTHORIZED }
  }
  if (amounts.fiscalDocumentId === null) {
    return { reason: CTE_BILLING_BLOCK_REASON.MISSING_DOCUMENT }
  }
  return { fiscalDocumentId: amounts.fiscalDocumentId }
}

/** A leitura é do mapa acumulado, não da página em tela: seleção sobrevive à troca de página. */
export function collectBillableCtes(
  input: Readonly<{
    amounts: ReadonlyMap<string, CteItemAmounts>
    selectedIds: readonly string[]
  }>,
): CteBillingSelection {
  const billable: BillableCte[] = []
  const blocked: BlockedCteForBilling[] = []
  const seen = new Set<string>()
  for (const itemId of input.selectedIds) {
    if (seen.has(itemId)) continue
    seen.add(itemId)
    const classification = classify(input.amounts.get(itemId))
    if ('reason' in classification) {
      blocked.push({ itemId, reason: classification.reason })
      continue
    }
    billable.push({ fiscalDocumentId: classification.fiscalDocumentId, itemId })
  }
  return { billable, blocked }
}

export function canBillBatch(
  input: Readonly<{ batch: CteBatchSummary; permissions: readonly string[] }>,
): boolean {
  return (
    input.permissions.includes(BILLING_CREATE_PERMISSION) &&
    BILLABLE_BATCH_STATUSES.includes(input.batch.status)
  )
}

export function collectBillableBatches(
  input: Readonly<{ batches: readonly CteBatchSummary[]; permissions: readonly string[] }>,
): readonly CteBatchSummary[] {
  return input.batches.filter((batch) => canBillBatch({ batch, permissions: input.permissions }))
}

export function canBillSelection(
  input: Readonly<{ billable: readonly BillableCte[]; permissions: readonly string[] }>,
): boolean {
  return input.permissions.includes(BILLING_CREATE_PERMISSION) && input.billable.length > 0
}
