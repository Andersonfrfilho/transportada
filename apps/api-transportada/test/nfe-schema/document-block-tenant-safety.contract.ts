/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildDocumentBatchLinkFilters,
  buildDocumentGrossWeightFilters,
  buildDocumentListFilters,
  buildDocumentNfseLinkFilters,
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

const ACCESS_KEY = '35260761156864000191550010000000022000000022'
const CURSOR = { createdAt: new Date('2026-07-22T14:01:00.000Z'), id: DOCUMENT_ID } as const

describe('NF-e document listing query tenant safety', () => {
  test('scopes the page by company even without cursor or access key', () => {
    const query = toSql(
      buildDocumentListFilters({ accessKey: null, companyId: COMPANY_ID, cursor: null }),
    )

    expect(query.sql).toContain('"nfe_documents"."company_id" = $')
    expect(query.params).toEqual([COMPANY_ID])
  })

  /** O filtro por chave nunca substitui o do tenant: chave de outra empresa precisa sair vazia. */
  test('keeps the company filter beside the access key', () => {
    const query = toSql(
      buildDocumentListFilters({ accessKey: ACCESS_KEY, companyId: COMPANY_ID, cursor: null }),
    )

    expect(query.sql).toContain('"nfe_documents"."company_id" = $')
    expect(query.sql).toContain('"nfe_documents"."access_key" = $')
    expect(query.params).toEqual([COMPANY_ID, ACCESS_KEY])
  })

  test('keeps the company filter beside the cursor and the access key', () => {
    const query = toSql(
      buildDocumentListFilters({ accessKey: ACCESS_KEY, companyId: COMPANY_ID, cursor: CURSOR }),
    )

    expect(query.sql).toContain('"nfe_documents"."company_id" = $')
    expect(query.sql).toContain('"nfe_documents"."access_key" = $')
    const issuedAt = CURSOR.createdAt.toISOString()
    expect(query.params).toEqual([COMPANY_ID, ACCESS_KEY, issuedAt, issuedAt, CURSOR.id])
  })
})

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

  /**
   * O vínculo com a nota de serviço é liberado marcando `cancelled_at` na mesma transação que
   * cancela a nota — é esse recorte, e não o status da fatura, que o índice parcial guarda.
   */
  test('scopes the active service invoice links by company and ignores released ones', () => {
    const query = toSql(buildDocumentNfseLinkFilters(LOOKUP))

    expect(query.sql).toContain('"nfse_service_invoice_documents"."company_id" = $')
    expect(query.sql).toContain('"nfse_service_invoice_documents"."nfe_document_id" in')
    expect(query.sql).toContain('"nfse_service_invoice_documents"."cancelled_at" is null')
    expect(query.params).toEqual([COMPANY_ID, DOCUMENT_ID, OTHER_DOCUMENT_ID])
  })
})
