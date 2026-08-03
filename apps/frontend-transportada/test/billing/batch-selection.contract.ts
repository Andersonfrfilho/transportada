/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  SYNTHETIC_CURSOR,
  loadFutureModule,
  type BillingEligibleCteContract,
  type BillingEligiblePageContract,
} from './billing.fixture'

const BATCH_SELECTION_SERVICE_PATH =
  '../../src/modules/billing/shared/billingBatchSelection.service'

const BATCH_ID_PRIMARY = '00000000-0000-4000-8000-000000000801'
const BATCH_ID_SECONDARY = '00000000-0000-4000-8000-000000000802'

const CUSTOMER_PRIMARY = { document: '12345678000199', name: 'Transportes Sul Ltda' } as const
const CUSTOMER_SECONDARY = { document: '98765432000188', name: 'Mercado Central ME' } as const

function eligibleCte(
  index: number,
  customer: Readonly<{ document: string; name: string }>,
): BillingEligibleCteContract {
  return {
    batchId: BATCH_ID_PRIMARY,
    batchName: 'Lote CT-e julho',
    cteId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    cteNumber: String(100000 + index),
    customerDocument: customer.document,
    customerName: customer.name,
    issuedAt: '2026-07-23T10:00:00.000Z',
    nfeNumber: String(4500 + index),
    totalAmount: '10.05',
  }
}

function eligiblePage(
  items: readonly BillingEligibleCteContract[],
  nextCursor: null | string,
): BillingEligiblePageContract {
  return { items, nextCursor }
}

describe('billing batch selection contract', () => {
  test('asks the eligible endpoint for the batches, page by page', async () => {
    const { serializeBillingBatchCteQuery } = await loadFutureModule<BillingBatchSelectionModule>(
      BATCH_SELECTION_SERVICE_PATH,
    )

    expect(
      serializeBillingBatchCteQuery({
        batchIds: [BATCH_ID_PRIMARY, BATCH_ID_SECONDARY],
        cursor: null,
        limit: 100,
      }),
    ).toBe(`limit=100&batchIdIn=${BATCH_ID_PRIMARY}%2C${BATCH_ID_SECONDARY}`)
    expect(
      serializeBillingBatchCteQuery({
        batchIds: [BATCH_ID_PRIMARY],
        cursor: SYNTHETIC_CURSOR,
        limit: 100,
      }),
    ).toBe(`limit=100&cursor=${SYNTHETIC_CURSOR}&batchIdIn=${BATCH_ID_PRIMARY}`)
    /** Sem lote não existe pergunta a fazer — cair aqui é bug de chamada, não filtro vazio. */
    expect(() => serializeBillingBatchCteQuery({ batchIds: [], cursor: null, limit: 100 })).toThrow(
      'BILLING_INVALID_BATCH_SELECTION',
    )
  })

  test('follows the cursor until the last page of the batch', async () => {
    const { collectBillableCtesForBatches } = await loadFutureModule<BillingBatchSelectionModule>(
      BATCH_SELECTION_SERVICE_PATH,
    )
    const pages = [
      eligiblePage(
        [eligibleCte(1, CUSTOMER_PRIMARY), eligibleCte(2, CUSTOMER_PRIMARY)],
        'cursor-2',
      ),
      eligiblePage([eligibleCte(3, CUSTOMER_SECONDARY)], null),
    ]
    const cursors: (null | string)[] = []

    const collected = await collectBillableCtesForBatches({
      batchIds: [BATCH_ID_PRIMARY],
      listPage: (input) => {
        cursors.push(input.cursor)
        return Promise.resolve(pages[cursors.length - 1] ?? eligiblePage([], null))
      },
    })

    expect(cursors).toEqual([null, 'cursor-2'])
    expect(collected.items.map((item) => item.cteNumber)).toEqual(['100001', '100002', '100003'])
    expect(collected.truncated).toBe(false)
  })

  test('stops at the declared ceiling instead of scanning a batch without end', async () => {
    const { collectBillableCtesForBatches, BILLING_BATCH_CTE_CEILING } =
      await loadFutureModule<BillingBatchSelectionModule>(BATCH_SELECTION_SERVICE_PATH)

    expect(BILLING_BATCH_CTE_CEILING).toBe(1000)

    let requestCount = 0
    const collected = await collectBillableCtesForBatches({
      batchIds: [BATCH_ID_PRIMARY],
      /** Página sempre cheia e cursor sempre presente: só o teto encerra a varredura. */
      listPage: () => {
        requestCount += 1
        const offset = requestCount * 100
        return Promise.resolve(
          eligiblePage(
            Array.from({ length: 100 }, (_unused, index) =>
              eligibleCte(offset + index, CUSTOMER_PRIMARY),
            ),
            `cursor-${requestCount}`,
          ),
        )
      },
    })

    expect(collected.items).toHaveLength(BILLING_BATCH_CTE_CEILING)
    expect(collected.truncated).toBe(true)
    expect(requestCount).toBe(BILLING_BATCH_CTE_CEILING / 100)
  })

  test('groups the batch by customer, keeping the order and the decimal sum', async () => {
    const { groupEligibleCtesByCustomer } = await loadFutureModule<BillingBatchSelectionModule>(
      BATCH_SELECTION_SERVICE_PATH,
    )

    const groups = groupEligibleCtesByCustomer([
      eligibleCte(1, CUSTOMER_PRIMARY),
      eligibleCte(2, CUSTOMER_SECONDARY),
      eligibleCte(3, CUSTOMER_PRIMARY),
    ])

    expect(groups).toEqual([
      {
        cteCount: 2,
        cteIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003'],
        customerDocument: CUSTOMER_PRIMARY.document,
        customerName: CUSTOMER_PRIMARY.name,
        part: 1,
        partCount: 1,
        totalAmount: '20.10',
      },
      {
        cteCount: 1,
        cteIds: ['00000000-0000-4000-8000-000000000002'],
        customerDocument: CUSTOMER_SECONDARY.document,
        customerName: CUSTOMER_SECONDARY.name,
        part: 1,
        partCount: 1,
        totalAmount: '10.05',
      },
    ])
  })

  test('splits a customer above the invoice ceiling into numbered parts', async () => {
    const { groupEligibleCtesByCustomer, BILLING_MAX_CTES_PER_INVOICE } =
      await loadFutureModule<BillingBatchSelectionModule>(BATCH_SELECTION_SERVICE_PATH)

    expect(BILLING_MAX_CTES_PER_INVOICE).toBe(100)

    const groups = groupEligibleCtesByCustomer(
      Array.from({ length: 130 }, (_unused, index) => eligibleCte(index + 1, CUSTOMER_PRIMARY)),
    )

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => [group.part, group.partCount, group.cteCount])).toEqual([
      [1, 2, 100],
      [2, 2, 30],
    ])
    /** A ordem dentro do tomador não pode embaralhar: a parte 2 continua de onde a 1 parou. */
    expect(groups[0]?.cteIds.at(-1)).toBe('00000000-0000-4000-8000-000000000100')
    expect(groups[1]?.cteIds.at(0)).toBe('00000000-0000-4000-8000-000000000101')
    expect(groups[0]?.totalAmount).toBe('1005.00')
    expect(groups[1]?.totalAmount).toBe('301.50')
  })

  test('never emits a group above what a single invoice accepts', async () => {
    const { groupEligibleCtesByCustomer, BILLING_MAX_CTES_PER_INVOICE } =
      await loadFutureModule<BillingBatchSelectionModule>(BATCH_SELECTION_SERVICE_PATH)

    const groups = groupEligibleCtesByCustomer(
      Array.from({ length: 250 }, (_unused, index) =>
        eligibleCte(index + 1, index % 2 === 0 ? CUSTOMER_PRIMARY : CUSTOMER_SECONDARY),
      ),
    )

    expect(groups.every((group) => group.cteCount <= BILLING_MAX_CTES_PER_INVOICE)).toBe(true)
    expect(groups.reduce((total, group) => total + group.cteCount, 0)).toBe(250)
    expect(groupEligibleCtesByCustomer([])).toEqual([])
  })
})

type BillingBatchCteGroup = Readonly<{
  cteCount: number
  cteIds: readonly string[]
  customerDocument: string
  customerName: string
  part: number
  partCount: number
  totalAmount: string
}>

type BillingBatchSelectionModule = {
  readonly BILLING_BATCH_CTE_CEILING: number
  readonly BILLING_MAX_CTES_PER_INVOICE: number
  readonly collectBillableCtesForBatches: (
    input: Readonly<{
      batchIds: readonly string[]
      listPage: (
        input: Readonly<{ batchIds: readonly string[]; cursor: null | string; limit: number }>,
      ) => Promise<BillingEligiblePageContract>
    }>,
  ) => Promise<Readonly<{ items: readonly BillingEligibleCteContract[]; truncated: boolean }>>
  readonly groupEligibleCtesByCustomer: (
    items: readonly BillingEligibleCteContract[],
  ) => readonly BillingBatchCteGroup[]
  readonly serializeBillingBatchCteQuery: (
    input: Readonly<{ batchIds: readonly string[]; cursor: null | string; limit: number }>,
  ) => string
}
