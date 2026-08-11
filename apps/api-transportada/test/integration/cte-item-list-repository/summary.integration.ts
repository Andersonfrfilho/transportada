/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect } from 'bun:test'

import { DrizzleCteBatchItemRepository } from '../../../src/cte-batches/infrastructure/drizzle-cte-batch-item.repository'
import { ITEM_SCENARIOS, testWithPostgres, withCteItemGraph } from './cte-item-graph.fixture'

/** Valores gravados no `calculation_snapshot` de todo item semeado pela fixture. */
const ITEM_BASE_AMOUNT = 1000
const ITEM_TOTAL_AMOUNT = 45

function expectedStatusCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const scenario of ITEM_SCENARIOS) {
    counts[scenario.expectedStatus] = (counts[scenario.expectedStatus] ?? 0) + 1
  }

  return counts
}

function scaled(unitAmount: number): string {
  return (unitAmount * ITEM_SCENARIOS.length).toFixed(4)
}

describe('cte item summary repository integration', () => {
  testWithPostgres(
    'sums the whole cut in SQL with the same derived status the listing shows',
    async () => {
      await withCteItemGraph(async ({ database, primary }) => {
        const repository = new DrizzleCteBatchItemRepository(database.db)

        const summary = await repository.summarizeCompanyItems({ companyId: primary.companyId })

        expect(summary.count).toBe(ITEM_SCENARIOS.length)
        expect(summary.baseAmount).toBe(scaled(ITEM_BASE_AMOUNT))
        expect(summary.totalAmount).toBe(scaled(ITEM_TOTAL_AMOUNT))
        expect(summary.statusCounts).toEqual(expectedStatusCounts())
        expect(summary.batchIds).toHaveLength(1)
        expect(summary.batchIdsTruncated).toBe(false)
      })
    },
  )

  testWithPostgres('narrows count and money by the same filters as the listing', async () => {
    await withCteItemGraph(async ({ database, primary }) => {
      const repository = new DrizzleCteBatchItemRepository(database.db)
      const authorizedCount = ITEM_SCENARIOS.filter(
        (scenario) => scenario.expectedStatus === 'authorized',
      ).length

      const summary = await repository.summarizeCompanyItems({
        companyId: primary.companyId,
        filters: { statusIn: ['authorized'] },
      })

      expect(summary.count).toBe(authorizedCount)
      expect(summary.statusCounts).toEqual({ authorized: authorizedCount })
      expect(summary.totalAmount).toBe((ITEM_TOTAL_AMOUNT * authorizedCount).toFixed(4))
    })
  })

  testWithPostgres('never sums another tenant, even when asked for its batch', async () => {
    await withCteItemGraph(async ({ database, primary, secondary }) => {
      const repository = new DrizzleCteBatchItemRepository(database.db)
      const primarySummary = await repository.summarizeCompanyItems({
        companyId: primary.companyId,
      })

      const leaked = await repository.summarizeCompanyItems({
        companyId: secondary.companyId,
        filters: { batchIdIn: primarySummary.batchIds },
      })

      expect(leaked).toEqual({
        baseAmount: '0.0000',
        batchIds: [],
        batchIdsTruncated: false,
        count: 0,
        statusCounts: {},
        totalAmount: '0.0000',
      })
    })
  })
})
