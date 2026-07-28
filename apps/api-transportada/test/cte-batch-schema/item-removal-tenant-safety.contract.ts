/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildBatchItemChargeFilters,
  buildBatchItemDocumentFilters,
  buildBatchItemRemovalFilters,
} from '../../src/cte-batches/infrastructure/drizzle-cte-batch.repository.js'

const BATCH_ID = '00000000-0000-4000-8000-000000000501'
const COMPANY_ID = '00000000-0000-4000-8000-000000000502'
const ITEM_ID = '00000000-0000-4000-8000-000000000507'

const LOOKUP = { batchId: BATCH_ID, companyId: COMPANY_ID, itemId: ITEM_ID } as const

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('CT-e batch item removal query tenant safety', () => {
  test('scopes the item lookup by company, batch and item', () => {
    const query = toSql(buildBatchItemRemovalFilters(LOOKUP))

    expect(query.sql).toContain('"cte_batch_items"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_items"."batch_id" = $')
    expect(query.sql).toContain('"cte_batch_items"."id" = $')
    expect(query.params).toEqual([COMPANY_ID, BATCH_ID, ITEM_ID])
  })

  test('scopes the freed document links by company, batch and item', () => {
    const query = toSql(buildBatchItemDocumentFilters(LOOKUP))

    expect(query.sql).toContain('"cte_batch_item_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_item_documents"."batch_id" = $')
    expect(query.sql).toContain('"cte_batch_item_documents"."item_id" = $')
    expect(query.params).toEqual([COMPANY_ID, BATCH_ID, ITEM_ID])
  })

  test('scopes the removed charges by company and item', () => {
    const query = toSql(buildBatchItemChargeFilters(LOOKUP))

    expect(query.sql).toContain('"cte_batch_item_charges"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_item_charges"."item_id" = $')
    expect(query.params).toEqual([COMPANY_ID, ITEM_ID])
  })
})
