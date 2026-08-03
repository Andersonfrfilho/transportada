/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect } from 'bun:test'

import type {
  CompanyCteItem,
  CompanyCteItemFilters,
} from '../../../src/cte-batches/application/cte-batch-item.port'
import { DrizzleCteBatchItemRepository } from '../../../src/cte-batches/infrastructure/drizzle-cte-batch-item.repository'
import { CTE_ISSUANCE_STATUSES } from '../../../src/database/cte-issuance.schema'
import {
  BASE_INVOICE_NUMBER,
  EXTRA_INVOICE_NUMBER,
  ITEM_SCENARIOS,
  TWO_INVOICE_SCENARIO_KEY,
  testWithPostgres,
  withCteItemGraph,
} from './cte-item-graph.fixture'

const PAGE_SIZE = 5

describe('cte item list repository integration', () => {
  testWithPostgres(
    'derives status in SQL exactly like the policy, isolates tenants, and never duplicates rows',
    async () => {
      await withCteItemGraph(async ({ database, primary, secondary }) => {
        const repository = new DrizzleCteBatchItemRepository(database.db)
        const readAll = async (
          companyId: string,
          filters?: CompanyCteItemFilters,
        ): Promise<readonly CompanyCteItem[]> => {
          const collected: CompanyCteItem[] = []
          let cursor: string | null = null
          do {
            const page: Awaited<ReturnType<typeof repository.listCompanyItems>> =
              await repository.listCompanyItems({
                companyId,
                cursor,
                limit: PAGE_SIZE,
                ...(filters === undefined ? {} : { filters }),
              })
            collected.push(...page.items)
            cursor = page.nextCursor
          } while (cursor !== null)

          return collected
        }

        const items = await readAll(primary.companyId)
        expect(items).toHaveLength(ITEM_SCENARIOS.length)
        expect(new Set(items.map((item) => item.id)).size).toBe(ITEM_SCENARIOS.length)

        const statusByItemId = new Map(items.map((item) => [item.id, item.status]))
        for (const scenario of ITEM_SCENARIOS) {
          const itemId = requiredId(primary.itemIdByScenario, scenario.key)
          expect({ key: scenario.key, status: statusByItemId.get(itemId) }).toEqual({
            key: scenario.key,
            status: scenario.expectedStatus,
          })
        }

        for (const status of CTE_ISSUANCE_STATUSES) {
          const expectedIds = sortedIds(items.filter((item) => item.status === status))
          const filtered = await readAll(primary.companyId, { statusIn: [status] })
          expect({ ids: sortedIds(filtered), status }).toEqual({ ids: expectedIds, status })
          expect(filtered.every((item) => item.status === status)).toBe(true)
        }

        const everyStatus = await readAll(primary.companyId, { statusIn: CTE_ISSUANCE_STATUSES })
        expect(sortedIds(everyStatus)).toEqual(sortedIds(items))

        const primaryIds = new Set(items.map((item) => item.id))
        const secondaryItems = await readAll(secondary.companyId)
        expect(secondaryItems).toHaveLength(ITEM_SCENARIOS.length)
        expect(secondaryItems.some((item) => primaryIds.has(item.id))).toBe(false)
        for (const status of CTE_ISSUANCE_STATUSES) {
          const filtered = await readAll(secondary.companyId, { statusIn: [status] })
          expect(filtered.some((item) => primaryIds.has(item.id))).toBe(false)
          expect(sortedIds(filtered)).toEqual(
            sortedIds(secondaryItems.filter((item) => item.status === status)),
          )
        }

        const twoInvoiceItemId = requiredId(primary.itemIdByScenario, TWO_INVOICE_SCENARIO_KEY)
        const extraInvoiceRange = await readAll(primary.companyId, {
          invoiceNumberGte: EXTRA_INVOICE_NUMBER,
          invoiceNumberLte: EXTRA_INVOICE_NUMBER,
        })
        expect(extraInvoiceRange.map((item) => item.id)).toEqual([twoInvoiceItemId])
        expect(extraInvoiceRange[0]?.documents).toHaveLength(2)

        const wideInvoiceRange = await readAll(primary.companyId, {
          invoiceNumberGte: String(BASE_INVOICE_NUMBER),
          invoiceNumberLte: EXTRA_INVOICE_NUMBER,
        })
        expect(sortedIds(wideInvoiceRange)).toEqual(sortedIds(items))

        const authorizedScenario = 'autorizada'
        const authorizedItemId = requiredId(primary.itemIdByScenario, authorizedScenario)
        const authorizedFiscalNumber = requiredId(
          primary.fiscalNumberByScenario,
          authorizedScenario,
        )
        const cteNumberRange = await readAll(primary.companyId, {
          cteNumberGte: authorizedFiscalNumber,
          cteNumberLte: authorizedFiscalNumber,
        })
        expect(cteNumberRange.map((item) => item.id)).toEqual([authorizedItemId])

        const firstPage = await repository.listCompanyItems({
          companyId: primary.companyId,
          cursor: null,
          limit: 3,
        })
        expect(firstPage.items).toHaveLength(3)
        expect(firstPage.nextCursor).not.toBeNull()
        const secondPage = await repository.listCompanyItems({
          companyId: primary.companyId,
          cursor: firstPage.nextCursor,
          limit: 3,
        })
        const firstPageIds = new Set(firstPage.items.map((item) => item.id))
        expect(secondPage.items.some((item) => firstPageIds.has(item.id))).toBe(false)
        expect(items.slice(0, 6).map((item) => item.id)).toEqual([
          ...firstPage.items.map((item) => item.id),
          ...secondPage.items.map((item) => item.id),
        ])
      })
    },
    60_000,
  )
})

function sortedIds(items: readonly CompanyCteItem[]): readonly string[] {
  return items.map((item) => item.id).toSorted()
}

function requiredId(source: ReadonlyMap<string, string>, key: string): string {
  const value = source.get(key)
  if (value === undefined) throw new Error(`MISSING_SCENARIO_${key}`)

  return value
}
