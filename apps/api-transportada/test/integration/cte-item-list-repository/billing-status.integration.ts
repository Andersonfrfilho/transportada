/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'
import { describe, expect } from 'bun:test'

import type {
  CompanyCteItem,
  CompanyCteItemFilters,
} from '../../../src/cte-batches/application/cte-batch-item.port'
import { DrizzleCteBatchItemRepository } from '../../../src/cte-batches/infrastructure/drizzle-cte-batch-item.repository'
import {
  billingInvoiceItems,
  billingInvoices,
  cteBatchItems,
  cteFiscalDocuments,
  userCompanyMemberships,
} from '../../../src/database/database.schema'
import type { TestDatabase } from './cte-item-graph.fixture'
import { ITEM_SCENARIOS, testWithPostgres, withCteItemGraph } from './cte-item-graph.fixture'

const PAGE_SIZE = 5
const INVOICED_SCENARIO_KEY = 'autorizada'

describe('cte item billing status integration', () => {
  testWithPostgres(
    'marks the CT-e already turned into an invoice, filters both ways, and never crosses tenants',
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

        const invoicedItemId = requiredValue(primary.itemIdByScenario, INVOICED_SCENARIO_KEY)
        await seedInvoiceForItem(database, { companyId: primary.companyId, itemId: invoicedItemId })

        const items = await readAll(primary.companyId)
        expect(items).toHaveLength(ITEM_SCENARIOS.length)
        const billingByItemId = new Map(items.map((item) => [item.id, item.billingStatus]))
        expect(billingByItemId.get(invoicedItemId)).toBe('invoiced')
        expect(
          items
            .filter((item) => item.id !== invoicedItemId)
            .every((item) => item.billingStatus === 'pending'),
        ).toBe(true)

        const invoiced = await readAll(primary.companyId, { billingStatusIn: ['invoiced'] })
        expect(invoiced.map((item) => item.id)).toEqual([invoicedItemId])
        /**
         * "Faturado" sozinho não permite conferir nada: quem olha a listagem precisa chegar à
         * fatura, e o número com a data de emissão são o que identificam ela no relatório.
         */
        expect(invoiced[0]?.billingInvoiceNumber).toBe('1')
        expect(invoiced[0]?.billingInvoicedAt).toBe('2026-07-20T12:00:00.000Z')
        expect(
          items
            .filter((item) => item.id !== invoicedItemId)
            .every((item) => item.billingInvoiceNumber === null && item.billingInvoicedAt === null),
        ).toBe(true)

        const pending = await readAll(primary.companyId, { billingStatusIn: ['pending'] })
        expect(pending.some((item) => item.id === invoicedItemId)).toBe(false)
        expect(pending).toHaveLength(ITEM_SCENARIOS.length - 1)

        const both = await readAll(primary.companyId, { billingStatusIn: ['invoiced', 'pending'] })
        expect(sortedIds(both)).toEqual(sortedIds(items))

        // O filtro de faturamento continua sendo um recorte do filtro de situação, não um substituto.
        const invoicedAndAuthorized = await readAll(primary.companyId, {
          billingStatusIn: ['invoiced'],
          statusIn: ['pending'],
        })
        expect(invoicedAndAuthorized).toEqual([])

        const secondaryItems = await readAll(secondary.companyId)
        expect(secondaryItems.every((item) => item.billingStatus === 'pending')).toBe(true)
        expect(await readAll(secondary.companyId, { billingStatusIn: ['invoiced'] })).toEqual([])
        expect(
          sortedIds(await readAll(secondary.companyId, { billingStatusIn: ['pending'] })),
        ).toEqual(sortedIds(secondaryItems))
      })
    },
    60_000,
  )
})

async function seedInvoiceForItem(
  database: TestDatabase,
  input: { readonly companyId: string; readonly itemId: string },
): Promise<void> {
  const [document] = await database.db
    .select({
      accessKey: cteFiscalDocuments.accessKey,
      fiscalNumber: cteFiscalDocuments.fiscalNumber,
      id: cteFiscalDocuments.id,
    })
    .from(cteFiscalDocuments)
    .where(
      and(
        eq(cteFiscalDocuments.companyId, input.companyId),
        eq(cteFiscalDocuments.batchItemId, input.itemId),
      ),
    )
    .limit(1)
  const [item] = await database.db
    .select({ batchId: cteBatchItems.batchId })
    .from(cteBatchItems)
    .where(and(eq(cteBatchItems.companyId, input.companyId), eq(cteBatchItems.id, input.itemId)))
    .limit(1)
  const [membership] = await database.db
    .select({ userId: userCompanyMemberships.userId })
    .from(userCompanyMemberships)
    .where(eq(userCompanyMemberships.companyId, input.companyId))
    .limit(1)
  if (document === undefined || item === undefined || membership === undefined) {
    throw new Error('BILLING_STATUS_FIXTURE_INCOMPLETE')
  }

  const invoiceId = crypto.randomUUID()
  await database.db.insert(billingInvoices).values({
    actorUserId: membership.userId,
    companyId: input.companyId,
    correlationId: `correlation-invoice-${input.itemId}`,
    currency: 'BRL',
    customerDocument: '00000000000191',
    customerName: 'Cliente de integracao',
    discountAmount: '0.00',
    dueDate: new Date('2026-08-20T12:00:00.000Z'),
    id: invoiceId,
    idempotencyKey: `invoice-${input.itemId}`,
    invoiceNumber: 1n,
    issueDate: new Date('2026-07-20T12:00:00.000Z'),
    requestFingerprint: `fingerprint-invoice-${input.itemId}`,
    status: 'issued',
    subtotalAmount: '45.00',
    surchargeAmount: '0.00',
    totalAmount: '45.00',
  })
  await database.db.insert(billingInvoiceItems).values({
    batchId: item.batchId,
    batchItemId: input.itemId,
    companyId: input.companyId,
    cteAccessKey: document.accessKey,
    cteDocumentId: document.id,
    cteNumber: document.fiscalNumber,
    description: 'Frete de integracao',
    freightAmount: '45.00',
    id: crypto.randomUUID(),
    invoiceId,
    lineNumber: 1n,
    snapshot: {},
    totalAmount: '45.00',
  })
}

function sortedIds(items: readonly CompanyCteItem[]): readonly string[] {
  return items.map((item) => item.id).toSorted()
}

function requiredValue(source: ReadonlyMap<string, string>, key: string): string {
  const value = source.get(key)
  if (value === undefined) throw new Error(`MISSING_SCENARIO_${key}`)

  return value
}
