/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { BillingEligibleCte, BillingEligiblePage } from './billingClient.service'

/** Teto de `cteIds` que `POST /billing/invoices` aceita — acima disso o tomador vira partes. */
export const BILLING_MAX_CTES_PER_INVOICE = 100
/** A varredura do lote precisa terminar: sem teto, um lote gigante prende a tela indefinidamente. */
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
  part: number
  partCount: number
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

export function groupEligibleCtesByCustomer(
  items: readonly BillingEligibleCte[],
): readonly BillingBatchCteGroup[] {
  const byCustomer = new Map<string, BillingEligibleCte[]>()

  for (const item of items) {
    const bucket = byCustomer.get(item.customerDocument)
    if (bucket === undefined) byCustomer.set(item.customerDocument, [item])
    else bucket.push(item)
  }

  return [...byCustomer.values()].flatMap(splitIntoInvoiceParts)
}

function splitIntoInvoiceParts(
  bucket: readonly BillingEligibleCte[],
): readonly BillingBatchCteGroup[] {
  const [first] = bucket
  if (first === undefined) return []
  const partCount = Math.ceil(bucket.length / BILLING_MAX_CTES_PER_INVOICE)

  return Array.from({ length: partCount }, (_unused, index) => {
    const part = bucket.slice(
      index * BILLING_MAX_CTES_PER_INVOICE,
      (index + 1) * BILLING_MAX_CTES_PER_INVOICE,
    )

    return {
      cteCount: part.length,
      cteIds: part.map((item) => item.cteId),
      customerDocument: first.customerDocument,
      customerName: first.customerName,
      part: index + 1,
      partCount,
      totalAmount: sumScaledAmounts(part.map((item) => item.totalAmount)),
    }
  })
}
