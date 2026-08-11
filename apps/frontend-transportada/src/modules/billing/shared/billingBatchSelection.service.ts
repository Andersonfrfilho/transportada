/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { BillingEligibleCte, BillingEligiblePage } from './billingClient.service'

/**
 * A varredura do lote precisa terminar: sem teto, um lote gigante prende a tela indefinidamente.
 * É o mesmo teto de `cteIds` que `POST /billing/invoices` aceita — o tomador cabe numa fatura só.
 */
export const BILLING_BATCH_CTE_CEILING = 1000
export const BILLING_BATCH_CTE_PAGE_LIMIT = 100

export const BILLING_BATCH_SELECTION_ERROR = {
  INVALID_BATCH_SELECTION: 'BILLING_INVALID_BATCH_SELECTION',
} as const

export type BillingBatchCteQuery = Readonly<{
  batchIds: readonly string[]
  cursor: null | string
  limit: number
}>

export type BillingBatchCteGroup = Readonly<{
  cteCount: number
  cteIds: readonly string[]
  customerDocument: string
  customerName: string
  totalAmount: string
}>

export type BillingBatchCteCollection = Readonly<{
  items: readonly BillingEligibleCte[]
  truncated: boolean
}>

type CollectBillableCtesInput = Readonly<{
  batchIds: readonly string[]
  listPage: (input: BillingBatchCteQuery) => Promise<BillingEligiblePage>
}>

export function serializeBillingBatchCteQuery(input: BillingBatchCteQuery): string {
  if (input.batchIds.length === 0) {
    throw new Error(BILLING_BATCH_SELECTION_ERROR.INVALID_BATCH_SELECTION)
  }
  const search = new URLSearchParams()
  search.set('limit', String(input.limit))
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('batchIdIn', input.batchIds.join(','))

  return search.toString()
}

/** Paginação por cursor é sequencial por natureza — cada página só existe depois da anterior. */
export async function collectBillableCtesForBatches(
  input: CollectBillableCtesInput,
): Promise<BillingBatchCteCollection> {
  const items: BillingEligibleCte[] = []
  let cursor: null | string = null

  for (;;) {
    const page: BillingEligiblePage = await input.listPage({
      batchIds: input.batchIds,
      cursor,
      limit: BILLING_BATCH_CTE_PAGE_LIMIT,
    })
    items.push(...page.items)
    if (items.length >= BILLING_BATCH_CTE_CEILING) {
      return { items: items.slice(0, BILLING_BATCH_CTE_CEILING), truncated: true }
    }
    if (page.nextCursor === null) return { items, truncated: false }
    cursor = page.nextCursor
  }
}

/** Um tomador, uma fatura: o volume de CT-es é problema de processamento, não do documento. */
export function groupEligibleCtesByCustomer(
  items: readonly BillingEligibleCte[],
): readonly BillingBatchCteGroup[] {
  const byCustomer = new Map<string, BillingEligibleCte[]>()

  for (const item of items) {
    const bucket = byCustomer.get(item.customerDocument)
    if (bucket === undefined) byCustomer.set(item.customerDocument, [item])
    else bucket.push(item)
  }

  return [...byCustomer.values()].flatMap(toInvoiceGroup)
}

function toInvoiceGroup(bucket: readonly BillingEligibleCte[]): readonly BillingBatchCteGroup[] {
  const [first] = bucket
  if (first === undefined) return []

  return [
    {
      cteCount: bucket.length,
      cteIds: bucket.map((item) => item.cteId),
      customerDocument: first.customerDocument,
      customerName: first.customerName,
      totalAmount: sumScaledAmounts(bucket.map((item) => item.totalAmount)),
    },
  ]
}
