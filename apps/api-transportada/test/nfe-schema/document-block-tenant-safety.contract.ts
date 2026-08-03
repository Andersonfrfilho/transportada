/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildDocumentBatchLinkFilters,
  buildDocumentGrossWeightFilters,
} from '../../src/nfe-documents/infrastructure/drizzle-nfe-document.repository.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000701'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000702'
const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-000000000703'

const LOOKUP = {
  companyId: COMPANY_ID,
  documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
} as const

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('NF-e document block query tenant safety', () => {
  test('scopes the gross weight aggregation by company and by the listed documents', () => {
    const query = toSql(buildDocumentGrossWeightFilters(LOOKUP))

    expect(query.sql).toContain('"nfe_volumes"."company_id" = $')
    expect(query.sql).toContain('"nfe_volumes"."document_id" in')
    expect(query.params).toEqual([COMPANY_ID, DOCUMENT_ID, OTHER_DOCUMENT_ID])
  })

  test('scopes the active batch links by company and ignores cancelled batches', () => {
    const query = toSql(buildDocumentBatchLinkFilters(LOOKUP))

    expect(query.sql).toContain('"cte_batch_item_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_item_documents"."nfe_document_id" in')
    expect(query.sql).toContain('"cte_batches"."status" <> $')
    expect(query.params).toEqual([COMPANY_ID, DOCUMENT_ID, OTHER_DOCUMENT_ID, 'cancelled'])
  })
})
