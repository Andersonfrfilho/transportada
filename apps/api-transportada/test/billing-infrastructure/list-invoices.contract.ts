/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildInvoiceItemCountFilters,
  buildInvoiceListFilters,
  mapInvoiceListRecord,
} from '../../src/billing/infrastructure/drizzle-billing.repository.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000801'
const INVOICE_ID = '00000000-0000-4000-8000-000000000802'
const SECONDARY_INVOICE_ID = '00000000-0000-4000-8000-000000000803'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000804'
const CURSOR_AT = new Date('2026-07-23T12:00:00.000Z')
const CURSOR_AT_PARAM = CURSOR_AT.toISOString()

const INVOICE_RECORD = {
  actorUserId: ACTOR_USER_ID,
  cancelledAt: null,
  companyId: COMPANY_ID,
  correlationId: 'correlation-0001',
  createdAt: CURSOR_AT,
  currency: 'BRL',
  customerDocument: '12345678000199',
  customerName: 'Transportes Sintetico Ltda',
  discountAmount: '0.00',
  dueDate: new Date('2026-08-05T00:00:00.000Z'),
  id: INVOICE_ID,
  idempotencyKey: 'idempotency-0001',
  invoiceNumber: 17n,
  issueDate: CURSOR_AT,
  observations: 'Fechamento mensal',
  requestFingerprint: 'fingerprint-0001',
  status: 'issued' as const,
  subtotalAmount: '350.50',
  surchargeAmount: '0.00',
  totalAmount: '350.50',
  updatedAt: CURSOR_AT,
}

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

const listFilters = (input: Parameters<typeof buildInvoiceListFilters>[0]) =>
  toSql(buildInvoiceListFilters(input))

describe('Billing invoice listing query tenant safety', () => {
  test('scopes the listing by company even without a single filter', () => {
    const query = listFilters({ companyId: COMPANY_ID, cursor: null })

    expect(query.sql).toContain('"billing_invoices"."company_id" = $')
    expect(query.params).toEqual([COMPANY_ID])
  })

  test('keeps the company filter in front of every optional filter', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: {
        customerDocument: '12345678000199',
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
        invoiceNumber: '17',
        issuedFrom: '2026-07-01',
        issuedTo: '2026-07-31',
        status: 'issued',
      },
    })

    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).not.toContain(undefined)
  })

  test('keeps the company filter in front of every list and range filter', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: {
        customerDocumentIn: ['12345678000199', '98765432000188'],
        invoiceNumberFrom: '10',
        invoiceNumberIn: ['3', '7'],
        invoiceNumberTo: '40',
        statusIn: ['issued', 'cancelled'],
      },
    })

    /** Nenhum filtro de lista pode chegar antes do recorte de empresa. */
    expect(query.sql.indexOf('"billing_invoices"."company_id" = $')).toBeLessThan(
      query.sql.indexOf('"billing_invoices"."invoice_number" in '),
    )
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).not.toContain(undefined)
  })
})

describe('Billing invoice item count query tenant safety', () => {
  test('scopes the item count by company and by the invoices of the page', () => {
    const query = toSql(
      buildInvoiceItemCountFilters({
        companyId: COMPANY_ID,
        invoiceIds: [INVOICE_ID, SECONDARY_INVOICE_ID],
      }),
    )

    expect(query.sql).toContain('"billing_invoice_items"."company_id" = $')
    expect(query.sql).toContain('"billing_invoice_items"."invoice_id" in ')
    expect(query.params).toEqual([COMPANY_ID, INVOICE_ID, SECONDARY_INVOICE_ID])
  })
})

describe('Billing invoice listing row shape', () => {
  test('carries the item count and the observations the listing screen renders', () => {
    const row = mapInvoiceListRecord(INVOICE_RECORD, 3)

    expect(row.itemCount).toBe(3)
    expect(row.observations).toBe('Fechamento mensal')
    expect(row.id).toBe(INVOICE_ID)
    expect(row.invoiceNumber).toBe('17')
    expect(row.issueDate).toBe(CURSOR_AT_PARAM)
    expect(row.totalAmount).toBe('350.50')
  })

  test('reports zero items instead of omitting the count when the invoice has none', () => {
    expect(mapInvoiceListRecord(INVOICE_RECORD, 0).itemCount).toBe(0)
  })

  test('never leaks the idempotency, fingerprint or actor of the invoice to the listing', () => {
    const row = mapInvoiceListRecord(INVOICE_RECORD, 1)

    expect(Object.keys(row)).not.toContain('idempotencyKey')
    expect(Object.keys(row)).not.toContain('requestFingerprint')
    expect(Object.keys(row)).not.toContain('actorUserId')
    expect(Object.keys(row)).not.toContain('correlationId')
  })
})

describe('Billing invoice listing query shape', () => {
  test('pages by the same keyset the CT-e item listing uses', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: { createdAt: CURSOR_AT, id: INVOICE_ID },
    })

    expect(query.sql).toContain('"billing_invoices"."created_at" < $')
    expect(query.sql).toContain('"billing_invoices"."created_at" = $')
    expect(query.sql).toContain('"billing_invoices"."id" < $')
    expect(query.params).toEqual([COMPANY_ID, CURSOR_AT_PARAM, CURSOR_AT_PARAM, INVOICE_ID])
  })

  test('filters the emission and due date windows independently', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: {
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
        issuedFrom: '2026-07-01',
        issuedTo: '2026-07-31',
      },
    })

    expect(query.sql).toContain('"billing_invoices"."issue_date" >= $')
    expect(query.sql).toContain('"billing_invoices"."issue_date" <= $')
    expect(query.sql).toContain('"billing_invoices"."due_date" >= $')
    expect(query.sql).toContain('"billing_invoices"."due_date" <= $')
  })

  test('filters status and invoice number without losing the company scope', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { invoiceNumber: '17', status: 'issued' },
    })

    expect(query.sql).toContain('"billing_invoices"."status" = $')
    expect(query.sql).toContain('"billing_invoices"."invoice_number" = $')
    expect(query.params).toEqual([COMPANY_ID, 'issued', 17n])
  })

  test('filters by customer document without losing the company scope', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { customerDocument: '12345678000199' },
    })

    expect(query.sql).toContain('"billing_invoices"."customer_document" = $')
    expect(query.params).toEqual([COMPANY_ID, '12345678000199'])
  })

  test('turns the invoice number list into an `in` over bigint', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { invoiceNumberIn: ['3', '7'] },
    })

    expect(query.sql).toContain('"billing_invoices"."invoice_number" in ')
    expect(query.params).toEqual([COMPANY_ID, 3n, 7n])
  })

  test('turns the invoice number range into a closed interval', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { invoiceNumberFrom: '10', invoiceNumberTo: '40' },
    })

    expect(query.sql).toContain('"billing_invoices"."invoice_number" >= $')
    expect(query.sql).toContain('"billing_invoices"."invoice_number" <= $')
    expect(query.params).toEqual([COMPANY_ID, 10n, 40n])
  })

  /** Em `and`, uma seleção disjunta (`3,7` mais `10-40`) devolveria zero linha. */
  test('combines the invoice number list and range with `or`, never with `and`', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: { invoiceNumberFrom: '10', invoiceNumberIn: ['3', '7'], invoiceNumberTo: '40' },
    })

    expect(query.sql).toContain(' or ')
    expect(query.sql).toContain('"billing_invoices"."invoice_number" in ')
    expect(query.sql).toContain('"billing_invoices"."invoice_number" >= $')
    expect(query.params).toEqual([COMPANY_ID, 3n, 7n, 10n, 40n])
  })

  test('turns the customer document list and the status list into `in`', () => {
    const query = listFilters({
      companyId: COMPANY_ID,
      cursor: null,
      filters: {
        customerDocumentIn: ['12345678000199', '98765432000188'],
        statusIn: ['issued', 'cancelled'],
      },
    })

    expect(query.sql).toContain('"billing_invoices"."customer_document" in ')
    expect(query.sql).toContain('"billing_invoices"."status" in ')
    expect(query.params).toEqual([
      COMPANY_ID,
      '12345678000199',
      '98765432000188',
      'issued',
      'cancelled',
    ])
  })
})
