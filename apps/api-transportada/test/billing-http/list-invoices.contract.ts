/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { buildInvoiceListFilters } from '../../src/billing/infrastructure/drizzle-billing.repository.js'
import {
  parseBillingInvoiceList,
  toBillingInvoiceListFilters,
} from '../../src/billing/presentation/billing.schema.js'
import {
  BILLING_INVOICES_PATH,
  COMPANY_CONTEXT,
  CREATE_ONLY_CONTEXT,
  INVOICES_PAGE,
  createBillingHttpFixture,
  listBillingInvoicesRequest,
  responseApiError,
} from '../fixtures/billing-http.fixture.js'

const INVOICE_LIST_MAX_VALUES = 100
const DOCUMENT_PRIMARY = '12345678000199'
const DOCUMENT_SECONDARY = '98765432000188'

function repeatedNumbers(total: number): string {
  return Array.from({ length: total }, (_, index) => String(index + 1)).join(',')
}

function repeatedDocuments(total: number): string {
  return Array.from({ length: total }, (_, index) =>
    String(index + 1).padStart(DOCUMENT_PRIMARY.length, '0'),
  ).join(',')
}

describe('Billing HTTP invoice listing contract', () => {
  test('lists invoices with cursor, status, period and customer filters in stable order', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(listBillingInvoicesRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: INVOICES_PAGE.items,
      page: { nextCursor: INVOICES_PAGE.nextCursor },
    })
    expect(fixture.listInvoiceCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: 'invoices-cursor-001',
        customerDocument: '12345678000199',
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
        invoiceNumber: '17',
        issuedFrom: '2026-07-01',
        issuedTo: '2026-07-31',
        limit: 25,
        status: 'issued',
      },
    ])
  })

  test('rejects an unknown query key before reaching the use case', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      new Request(`http://api.test${BILLING_INVOICES_PATH}?status=issued&unknown=1`, {
        headers: { authorization: 'Bearer token' },
        method: 'GET',
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.listInvoiceCalls).toEqual([])
  })

  test('forwards the invoice number list, the customer document list and the status list', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listBillingInvoicesRequest(
        `?invoiceNumberIn=3,7&customerDocumentIn=${DOCUMENT_PRIMARY},${DOCUMENT_SECONDARY}&statusIn=issued,cancelled`,
      ),
    )

    expect(response.status).toBe(200)
    expect(fixture.listInvoiceCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: null,
        customerDocumentIn: [DOCUMENT_PRIMARY, DOCUMENT_SECONDARY],
        invoiceNumberIn: ['3', '7'],
        limit: 25,
        statusIn: ['issued', 'cancelled'],
      },
    ])
  })

  test('forwards an invoice number range on its own', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listBillingInvoicesRequest('?invoiceNumberFrom=10&invoiceNumberTo=40'),
    )

    expect(response.status).toBe(200)
    expect(fixture.listInvoiceCalls[0]?.invoiceNumberFrom).toBe('10')
    expect(fixture.listInvoiceCalls[0]?.invoiceNumberTo).toBe('40')
    expect(fixture.listInvoiceCalls[0]?.invoiceNumberIn).toBeUndefined()
  })

  /** Lista e faixa são alternativas do mesmo domínio: a rota repassa as duas para o `or` da query. */
  test('forwards an invoice number list and range together', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listBillingInvoicesRequest('?invoiceNumberIn=3,7&invoiceNumberFrom=10&invoiceNumberTo=40'),
    )

    expect(response.status).toBe(200)
    expect(fixture.listInvoiceCalls[0]?.invoiceNumberIn).toEqual(['3', '7'])
    expect(fixture.listInvoiceCalls[0]?.invoiceNumberFrom).toBe('10')
    expect(fixture.listInvoiceCalls[0]?.invoiceNumberTo).toBe('40')
  })

  test('accepts the lists at the maximum size', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      listBillingInvoicesRequest(
        `?invoiceNumberIn=${repeatedNumbers(INVOICE_LIST_MAX_VALUES)}&customerDocumentIn=${repeatedDocuments(INVOICE_LIST_MAX_VALUES)}`,
      ),
    )

    expect(response.status).toBe(200)
    expect(fixture.listInvoiceCalls[0]?.invoiceNumberIn).toHaveLength(INVOICE_LIST_MAX_VALUES)
    expect(fixture.listInvoiceCalls[0]?.customerDocumentIn).toHaveLength(INVOICE_LIST_MAX_VALUES)
  })

  test('refuses every malformed list, range or conflicting filter before reaching the use case', async () => {
    /** Cada consulta prova uma recusa distinta; nenhuma pode chegar ao caso de uso. */
    for (const query of [
      '?invoiceNumberIn=',
      '?invoiceNumberIn=3,abc',
      '?invoiceNumberIn=3,,7',
      '?invoiceNumberIn=3&invoiceNumberIn=7',
      `?invoiceNumberIn=${repeatedNumbers(INVOICE_LIST_MAX_VALUES + 1)}`,
      '?invoiceNumberFrom=10',
      '?invoiceNumberTo=40',
      '?invoiceNumberFrom=40&invoiceNumberTo=10',
      '?invoiceNumberFrom=abc&invoiceNumberTo=40',
      '?invoiceNumberFrom=&invoiceNumberTo=40',
      '?invoiceNumber=17&invoiceNumberIn=3',
      '?invoiceNumber=17&invoiceNumberFrom=10&invoiceNumberTo=40',
      '?customerDocumentIn=',
      `?customerDocumentIn=${DOCUMENT_PRIMARY},1234567890`,
      `?customerDocumentIn=${DOCUMENT_PRIMARY},123456780001999`,
      `?customerDocumentIn=${DOCUMENT_PRIMARY},,${DOCUMENT_SECONDARY}`,
      `?customerDocumentIn=${repeatedDocuments(INVOICE_LIST_MAX_VALUES + 1)}`,
      `?customerDocument=${DOCUMENT_PRIMARY}&customerDocumentIn=${DOCUMENT_SECONDARY}`,
      '?statusIn=',
      '?statusIn=issued,unknown',
      '?statusIn=issued,issued',
      '?status=issued&statusIn=cancelled',
    ]) {
      const fixture = await createBillingHttpFixture()

      const response = await fixture.handle(listBillingInvoicesRequest(query))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.listInvoiceCalls).toEqual([])
    }
  })

  test('requires billing.read to list invoices', async () => {
    const fixture = await createBillingHttpFixture({
      permissions: CREATE_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(listBillingInvoicesRequest())

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(fixture.listInvoiceCalls).toEqual([])
  })
})

describe('Billing invoice filter forwarding contract', () => {
  const dialect = new PgDialect()
  const COMPANY_ID = '00000000-0000-4000-8000-000000000801'
  const FULL_FILTER_QUERY =
    `?customerDocumentIn=${DOCUMENT_PRIMARY},${DOCUMENT_SECONDARY}` +
    '&dueFrom=2026-08-01&dueTo=2026-08-31' +
    '&invoiceNumberFrom=10&invoiceNumberIn=3,7&invoiceNumberTo=40' +
    '&issuedFrom=2026-07-01&issuedTo=2026-07-31&statusIn=issued,cancelled'

  /** Filtro aceito pela rota e perdido antes da query é falha silenciosa: a tela filtra e nada muda. */
  test('carries every parsed filter down to the compiled where', () => {
    const filters = toBillingInvoiceListFilters(
      parseBillingInvoiceList(
        new URL(`http://localhost${BILLING_INVOICES_PATH}${FULL_FILTER_QUERY}`),
      ),
    )

    const informedKeys = Object.entries(filters)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key)
      .sort()

    expect(informedKeys).toEqual([
      'customerDocumentIn',
      'dueFrom',
      'dueTo',
      'invoiceNumberFrom',
      'invoiceNumberIn',
      'invoiceNumberTo',
      'issuedFrom',
      'issuedTo',
      'statusIn',
    ])

    const query = dialect.sqlToQuery(
      and(...buildInvoiceListFilters({ companyId: COMPANY_ID, cursor: null, filters }))!,
    )

    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.sql).toContain('"billing_invoices"."customer_document" in ')
    expect(query.sql).toContain('"billing_invoices"."status" in ')
    expect(query.sql).toContain('"billing_invoices"."invoice_number" in ')
    expect(query.sql).toContain('"billing_invoices"."invoice_number" >= $')
    expect(query.sql).toContain('"billing_invoices"."issue_date" >= $')
    expect(query.sql).toContain('"billing_invoices"."due_date" <= $')
  })
})
