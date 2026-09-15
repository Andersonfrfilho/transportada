/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildActiveEmissionProfileFilters,
  buildNfseProfileJoin,
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
const CURSOR = {
  id: DOCUMENT_ID,
  issuedAt: '2026-07-22T14:01:00.000000Z',
  updatedAt: '2026-09-14T10:15:30.123456Z',
} as const

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
    expect(query.sql).toContain(
      '("nfe_documents"."updated_at", "nfe_documents"."issued_at", "nfe_documents"."id") < (',
    )
    expect(query.params).toEqual([
      COMPANY_ID,
      ACCESS_KEY,
      CURSOR.updatedAt,
      CURSOR.issuedAt,
      CURSOR.id,
    ])
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
  /** Perfis carregados uma vez por página: o recorte de empresa é o que impede ler perfil alheio. */
  test('scopes the active emission profiles by company', () => {
    const query = toSql(buildActiveEmissionProfileFilters(COMPANY_ID))

    expect(query.sql).toContain('"cte_emission_profiles"."company_id" = $')
    expect(query.sql).toContain('"cte_emission_profiles"."status" = $')
    expect(query.params).toEqual([COMPANY_ID, 'active'])
  })

  /** O status do perfil NFS-e entra pelo par da FK composta, nunca só pelo id (spec 144 D3). */
  test('joins the NFS-e profile by company and id, never by id alone', () => {
    const query = dialect.sqlToQuery(buildNfseProfileJoin())

    expect(query.sql).toContain(
      '"nfse_emission_profiles"."company_id" = "cte_emission_profiles"."company_id"',
    )
    expect(query.sql).toContain(
      '"nfse_emission_profiles"."id" = "cte_emission_profiles"."nfse_emission_profile_id"',
    )
    expect(query.params).toEqual([])
  })

  test('scopes the active service invoice links by company and ignores released ones', () => {
    const query = toSql(buildDocumentNfseLinkFilters(LOOKUP))

    expect(query.sql).toContain('"nfse_service_invoice_documents"."company_id" = $')
    expect(query.sql).toContain('"nfse_service_invoice_documents"."nfe_document_id" in')
    expect(query.sql).toContain('"nfse_service_invoice_documents"."cancelled_at" is null')
    expect(query.params).toEqual([COMPANY_ID, DOCUMENT_ID, OTHER_DOCUMENT_ID])
  })
})
