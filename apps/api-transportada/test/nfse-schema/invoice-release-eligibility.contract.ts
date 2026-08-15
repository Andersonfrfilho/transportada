/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { type SQL, and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { buildActiveNfseLinkFilters } from '../../src/cte-batches/infrastructure/cte-batch-selection.query.js'
import { buildDocumentNfseLinkFilters } from '../../src/nfe-documents/infrastructure/drizzle-nfe-document.repository.js'
import { buildActiveInvoiceLinkFilters } from '../../src/nfse-invoices/infrastructure/nfse-invoice-issuance.query.js'
import { buildInvoiceLinkReleaseFilters } from '../../src/nfse-invoices/infrastructure/nfse-invoice-query.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000d01'
const INVOICE_ID = '00000000-0000-4000-8000-000000000d02'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000d03'

const ACTIVE_CUT = '"nfse_service_invoice_documents"."cancelled_at" is null'

const dialect = new PgDialect()

const LINK_QUERY = { companyId: COMPANY_ID, documentIds: [DOCUMENT_ID] } as const

function compile(filters: readonly SQL[]): string {
  return dialect.sqlToQuery(and(...filters)!).sql
}

/**
 * Cancelar a nota de serviço não apaga o vínculo: ele ganha `cancelled_at`, e é o índice parcial
 * único `nfse_service_invoice_documents_active_nfe_unique` que devolve a NF-e à seleção. A garantia
 * só vale enquanto todo caminho de elegibilidade ler pelo mesmo recorte — um único `where` esquecido
 * deixa a nota presa a uma NFS-e que já não existe.
 */
describe('nfse invoice release eligibility', () => {
  test('a liberação marca a data no vínculo ainda ativo', () => {
    const query = compile(
      buildInvoiceLinkReleaseFilters({ companyId: COMPANY_ID, invoiceId: INVOICE_ID }),
    )

    expect(query).toContain(ACTIVE_CUT)
  })

  /** Sem o recorte aqui, a NF-e liberada continuaria bloqueada para uma nova nota de serviço. */
  test('a seleção de uma nova NFS-e ignora o vínculo cancelado', () => {
    expect(compile(buildActiveInvoiceLinkFilters(LINK_QUERY))).toContain(ACTIVE_CUT)
  })

  /** Sem o recorte aqui, a NF-e liberada continuaria bloqueada para lote de CT-e. */
  test('a seleção de lote de CT-e ignora o vínculo cancelado', () => {
    expect(compile(buildActiveNfseLinkFilters(LINK_QUERY))).toContain(ACTIVE_CUT)
  })

  /** A tabela de notas mostraria "vinculada a NFS-e" para uma nota já livre. */
  test('a listagem de NF-e ignora o vínculo cancelado', () => {
    expect(compile(buildDocumentNfseLinkFilters(LINK_QUERY))).toContain(ACTIVE_CUT)
  })

  /** Todos os caminhos precisam do mesmo `company_id`: o recorte não pode atravessar empresa. */
  test('os quatro caminhos continuam presos à empresa do contexto', () => {
    const queries = [
      compile(buildInvoiceLinkReleaseFilters({ companyId: COMPANY_ID, invoiceId: INVOICE_ID })),
      compile(buildActiveInvoiceLinkFilters(LINK_QUERY)),
      compile(buildActiveNfseLinkFilters(LINK_QUERY)),
      compile(buildDocumentNfseLinkFilters(LINK_QUERY)),
    ]

    for (const query of queries) {
      expect(query).toContain('"nfse_service_invoice_documents"."company_id" = $')
    }
  })
})
