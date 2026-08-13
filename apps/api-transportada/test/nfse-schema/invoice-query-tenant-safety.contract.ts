/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { type SQL, and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildFiscalDocumentFilters,
  buildInvoiceChargeFilters,
  buildInvoiceCursorFilter,
  buildInvoiceDocumentCountExpression,
  buildInvoiceDocumentFilters,
  buildInvoiceDocumentJoin,
  buildInvoiceLinkReleaseFilters,
  buildInvoiceListFilters,
  buildInvoiceScopeFilters,
  buildStoredObjectFilters,
} from '../../src/nfse-invoices/infrastructure/nfse-invoice-query.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000c01'
const INVOICE_ID = '00000000-0000-4000-8000-000000000c02'
const OBJECT_ID = '00000000-0000-4000-8000-000000000c03'
const CURSOR_ID = '00000000-0000-4000-8000-000000000c04'
const CURSOR_CREATED_AT = '2026-08-12T12:00:00.000Z'
const TAKER_TAX_ID = '12345678000199'

const dialect = new PgDialect()

const SCOPE = { companyId: COMPANY_ID, invoiceId: INVOICE_ID }

function compile(filters: readonly SQL[]): {
  readonly params: readonly string[]
  readonly sql: string
} {
  const query = dialect.sqlToQuery(and(...filters)!)
  return { params: query.params.map((value) => String(value)), sql: query.sql }
}

describe('nfse invoice query tenant safety', () => {
  test('a listagem é presa à empresa do contexto', () => {
    const query = compile(buildInvoiceListFilters({ companyId: COMPANY_ID }))

    expect(query.sql).toContain('"nfse_service_invoices"."company_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  test('os filtros de status e tomador entram sem soltar a empresa', () => {
    const query = compile(
      buildInvoiceListFilters({
        companyId: COMPANY_ID,
        filters: { statusIn: ['authorized', 'cancelled'], takerTaxIdEq: TAKER_TAX_ID },
      }),
    )

    expect(query.sql).toContain('"nfse_service_invoices"."company_id" = $')
    expect(query.sql).toContain('"nfse_service_invoices"."status" in (')
    expect(query.sql).toContain('"nfse_service_invoices"."taker_tax_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).toContain(TAKER_TAX_ID)
  })

  /** O cursor é keyset por `(created_at, id)`: com `offset` a página anda sozinha entre emissões. */
  test('o cursor compara a tupla created_at e id', () => {
    const cursor = dialect.sqlToQuery(
      buildInvoiceCursorFilter({ createdAt: CURSOR_CREATED_AT, id: CURSOR_ID }),
    )

    expect(cursor.sql).toContain('"nfse_service_invoices"."created_at"')
    expect(cursor.sql).toContain('"nfse_service_invoices"."id"')
    expect(cursor.sql).toContain('<')
    expect(cursor.params.map((value) => String(value))).toContain(CURSOR_ID)
  })

  /** O detalhe é buscado por `(company_id, id)`: só o id deixaria ler a nota de outra empresa. */
  test('o detalhe é preso à empresa do contexto', () => {
    const query = compile(buildInvoiceScopeFilters(SCOPE))

    expect(query.sql).toContain('"nfse_service_invoices"."company_id" = $')
    expect(query.sql).toContain('"nfse_service_invoices"."id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).toContain(INVOICE_ID)
  })

  test('as linhas de encargo são presas à empresa do contexto', () => {
    const query = compile(buildInvoiceChargeFilters(SCOPE))

    expect(query.sql).toContain('"nfse_service_invoice_charges"."company_id" = $')
    expect(query.sql).toContain('"nfse_service_invoice_charges"."invoice_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  test('os vínculos do detalhe são presos à empresa do contexto', () => {
    const query = compile(buildInvoiceDocumentFilters(SCOPE))

    expect(query.sql).toContain('"nfse_service_invoice_documents"."company_id" = $')
    expect(query.sql).toContain('"nfse_service_invoice_documents"."invoice_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  /** Sem `company_id` no join, o vínculo alcançaria a nota fiscal de outra empresa pelo id sozinho. */
  test('o join com nfe_documents carrega company_id além do documentId', () => {
    const join = dialect.sqlToQuery(buildInvoiceDocumentJoin())

    expect(join.sql).toContain(
      '"nfe_documents"."company_id" = "nfse_service_invoice_documents"."company_id"',
    )
    expect(join.sql).toContain(
      '"nfe_documents"."id" = "nfse_service_invoice_documents"."nfe_document_id"',
    )
  })

  /**
   * A liberação carrega o mesmo `cancelled_at is null` do índice parcial único da tabela: sem ele,
   * cancelar duas vezes reescreveria a data e a nota nunca voltaria para a seleção com a marca certa.
   */
  test('a liberação dos vínculos só alcança linha ainda não cancelada da empresa', () => {
    const query = compile(buildInvoiceLinkReleaseFilters(SCOPE))

    expect(query.sql).toContain('"nfse_service_invoice_documents"."company_id" = $')
    expect(query.sql).toContain('"nfse_service_invoice_documents"."invoice_id" = $')
    expect(query.sql).toContain('"nfse_service_invoice_documents"."cancelled_at" is null')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  /**
   * A subconsulta é correlacionada: sem o nome da tabela nas colunas de fora, o Postgres resolve os
   * dois lados na tabela interna — `company_id = company_id` vira sempre verdadeiro e
   * `invoice_id = id` nunca casa. A contagem sai zero sem nenhum erro.
   */
  test('a contagem de documentos se correlaciona com a nota de fora', () => {
    const expression = dialect.sqlToQuery(buildInvoiceDocumentCountExpression())

    expect(expression.sql).toContain(
      '"nfse_service_invoice_documents"."company_id" = "nfse_service_invoices"."company_id"',
    )
    expect(expression.sql).toContain(
      '"nfse_service_invoice_documents"."invoice_id" = "nfse_service_invoices"."id"',
    )
  })

  test('o documento fiscal é preso à empresa do contexto', () => {
    const query = compile(buildFiscalDocumentFilters(SCOPE))

    expect(query.sql).toContain('"nfse_fiscal_documents"."company_id" = $')
    expect(query.sql).toContain('"nfse_fiscal_documents"."invoice_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  /** O objeto armazenado guarda XML fiscal: sem `company_id`, o id sozinho assinaria o de outra empresa. */
  test('o objeto armazenado é preso à empresa do contexto', () => {
    const query = compile(buildStoredObjectFilters({ companyId: COMPANY_ID, objectId: OBJECT_ID }))

    expect(query.sql).toContain('"stored_objects"."company_id" = $')
    expect(query.sql).toContain('"stored_objects"."id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).toContain(OBJECT_ID)
  })
})
