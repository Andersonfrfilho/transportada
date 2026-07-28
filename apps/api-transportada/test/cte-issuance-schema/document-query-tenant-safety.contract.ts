/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildBatchItemFilters,
  buildFiscalDocumentFilters,
} from '../../src/cte-issuance/infrastructure/drizzle-cte-issuance.repository.js'

const BATCH_ID = '00000000-0000-4000-8000-000000000701'
const BATCH_ITEM_ID = '00000000-0000-4000-8000-000000000702'
const COMPANY_ID = '00000000-0000-4000-8000-000000000703'

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('CT-e fiscal document query tenant safety', () => {
  test('scopes the batch item lookup by company, batch and item', () => {
    const query = toSql(
      buildBatchItemFilters({
        batchId: BATCH_ID,
        batchItemId: BATCH_ITEM_ID,
        companyId: COMPANY_ID,
      }),
    )

    expect(query.sql).toContain('"cte_batch_items"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_items"."batch_id" = $')
    expect(query.sql).toContain('"cte_batch_items"."id" = $')
    expect(query.params).toEqual([BATCH_ID, COMPANY_ID, BATCH_ITEM_ID])
  })

  test('keeps the company filter when no item is requested', () => {
    const query = toSql(buildBatchItemFilters({ batchId: BATCH_ID, companyId: COMPANY_ID }))

    expect(query.sql).toContain('"cte_batch_items"."company_id" = $')
    expect(query.sql).not.toContain('"cte_batch_items"."id" = $')
    expect(query.params).toEqual([BATCH_ID, COMPANY_ID])
  })

  test('scopes the fiscal document listing by company on the document and by batch on the item', () => {
    const query = toSql(
      buildFiscalDocumentFilters({
        batchId: BATCH_ID,
        batchItemId: BATCH_ITEM_ID,
        companyId: COMPANY_ID,
      }),
    )

    expect(query.sql).toContain('"cte_fiscal_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_fiscal_documents"."batch_item_id" = $')
    expect(query.sql).toContain('"cte_batch_items"."batch_id" = $')
    expect(query.params).toEqual([COMPANY_ID, BATCH_ITEM_ID, BATCH_ID])
  })
})
