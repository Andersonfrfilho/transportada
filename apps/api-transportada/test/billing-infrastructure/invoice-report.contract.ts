/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildCteDocumentFilters,
  buildInvoiceItemFilters,
  buildItemDocumentFilters,
  buildNfeDocumentFilters,
  buildRecipientFilters,
  buildVolumeFilters,
  findInvoiceReportRows,
} from '../../src/billing/infrastructure/invoice-report.query.js'
import {
  buildInvoiceReportRows,
  createInvoiceReportQueryableStub,
  REPORT_BATCH_ITEM_A_ID,
  REPORT_BATCH_ITEM_B_ID,
  REPORT_COMPANY_ID,
  REPORT_CTE_DOCUMENT_A_AUTHORIZED_AT,
  REPORT_CTE_DOCUMENT_B_AUTHORIZED_AT,
  REPORT_INVOICE_ID,
} from './support.js'

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('Invoice report query tenant safety', () => {
  test('scopes billing invoice items by company and invoice', () => {
    const query = toSql(
      buildInvoiceItemFilters({ companyId: REPORT_COMPANY_ID, invoiceId: REPORT_INVOICE_ID }),
    )

    expect(query.sql).toContain('"billing_invoice_items"."company_id" = $')
    expect(query.sql).toContain('"billing_invoice_items"."invoice_id" = $')
    expect(query.params).toEqual([REPORT_COMPANY_ID, REPORT_INVOICE_ID])
  })

  test('scopes CT-e fiscal documents by company', () => {
    const query = toSql(
      buildCteDocumentFilters({ cteDocumentIds: ['doc-1', 'doc-2'], companyId: REPORT_COMPANY_ID }),
    )

    expect(query.sql).toContain('"cte_fiscal_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_fiscal_documents"."id" in')
    expect(query.params).toEqual([REPORT_COMPANY_ID, 'doc-1', 'doc-2'])
  })

  test('scopes the batch item document bundle by company', () => {
    const query = toSql(
      buildItemDocumentFilters({
        batchItemIds: [REPORT_BATCH_ITEM_A_ID, REPORT_BATCH_ITEM_B_ID],
        companyId: REPORT_COMPANY_ID,
      }),
    )

    expect(query.sql).toContain('"cte_batch_item_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_item_documents"."item_id" in')
    expect(query.params).toEqual([
      REPORT_COMPANY_ID,
      REPORT_BATCH_ITEM_A_ID,
      REPORT_BATCH_ITEM_B_ID,
    ])
  })

  test('scopes NF-e documents by company', () => {
    const query = toSql(
      buildNfeDocumentFilters({ companyId: REPORT_COMPANY_ID, documentIds: ['nfe-1', 'nfe-2'] }),
    )

    expect(query.sql).toContain('"nfe_documents"."company_id" = $')
    expect(query.sql).toContain('"nfe_documents"."id" in')
    expect(query.params).toEqual([REPORT_COMPANY_ID, 'nfe-1', 'nfe-2'])
  })

  test('scopes the recipient participant by company and role', () => {
    const query = toSql(
      buildRecipientFilters({ companyId: REPORT_COMPANY_ID, documentIds: ['nfe-1', 'nfe-2'] }),
    )

    expect(query.sql).toContain('"nfe_participants"."company_id" = $')
    expect(query.sql).toContain('"nfe_participants"."document_id" in')
    expect(query.sql).toContain('"nfe_participants"."role" = $')
    expect(query.params).toEqual([REPORT_COMPANY_ID, 'nfe-1', 'nfe-2', 'recipient'])
  })

  test('scopes NF-e volumes by company', () => {
    const query = toSql(
      buildVolumeFilters({ companyId: REPORT_COMPANY_ID, documentIds: ['nfe-1', 'nfe-2'] }),
    )

    expect(query.sql).toContain('"nfe_volumes"."company_id" = $')
    expect(query.sql).toContain('"nfe_volumes"."document_id" in')
    expect(query.params).toEqual([REPORT_COMPANY_ID, 'nfe-1', 'nfe-2'])
  })
})

describe('Invoice report query shape', () => {
  test('returns one row per billing invoice item, ordered by line number', async () => {
    const { queryable } = createInvoiceReportQueryableStub(buildInvoiceReportRows())

    const rows = await findInvoiceReportRows(queryable, {
      companyId: REPORT_COMPANY_ID,
      invoiceId: REPORT_INVOICE_ID,
    })

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.batchItemId)).toEqual([
      REPORT_BATCH_ITEM_A_ID,
      REPORT_BATCH_ITEM_B_ID,
    ])
  })

  test('sums weight across every volume row of a single NF-e', async () => {
    const { queryable } = createInvoiceReportQueryableStub(buildInvoiceReportRows())

    const rows = await findInvoiceReportRows(queryable, {
      companyId: REPORT_COMPANY_ID,
      invoiceId: REPORT_INVOICE_ID,
    })

    const [itemA] = rows
    expect(itemA?.issuedAt).toEqual(REPORT_CTE_DOCUMENT_A_AUTHORIZED_AT)
    expect(itemA?.cteFiscalNumber).toBe(1001n)
    expect(itemA?.cteFiscalSeries).toBe('1')
    expect(itemA?.recipientTaxId).toBe('11222333000181')
    expect(itemA?.recipientLegalName).toBe('DESTINATARIO ALFA LTDA')
    expect(itemA?.nfeDocuments).toEqual([{ number: '555', series: '1' }])
    expect(itemA?.grossWeight).toBe('130.5000')
    expect(itemA?.netWeight).toBe('119.0000')
    expect(itemA?.totalAmount).toBe('850.00')
  })

  test('bundles every NF-e of a CT-e in the same row and zeroes the weight of a note without <vol>', async () => {
    const { queryable } = createInvoiceReportQueryableStub(buildInvoiceReportRows())

    const rows = await findInvoiceReportRows(queryable, {
      companyId: REPORT_COMPANY_ID,
      invoiceId: REPORT_INVOICE_ID,
    })

    const [, itemB] = rows
    expect(itemB?.issuedAt).toEqual(REPORT_CTE_DOCUMENT_B_AUTHORIZED_AT)
    expect(itemB?.cteFiscalNumber).toBe(1002n)
    expect(itemB?.nfeDocuments).toEqual([
      { number: '600', series: '2' },
      { number: '601', series: '2' },
    ])
    expect(itemB?.recipientTaxId).toBe('44555666000172')
    expect(itemB?.grossWeight).toBe('45.2500')
    expect(itemB?.netWeight).toBe('40.0000')
    expect(itemB?.totalAmount).toBe('620.00')
  })

  test('returns an empty list when the invoice has no billing items', async () => {
    const { queryable } = createInvoiceReportQueryableStub({ billing_invoice_items: [] })

    const rows = await findInvoiceReportRows(queryable, {
      companyId: REPORT_COMPANY_ID,
      invoiceId: REPORT_INVOICE_ID,
    })

    expect(rows).toEqual([])
  })
})
