/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  BILLING_ELIGIBLE_CTES_PATH,
  BILLING_INVOICES_PATH,
  COMPANY_CONTEXT,
  CTE_ID_PRIMARY,
  ELIGIBLE_CTES_PAGE,
  ELIGIBLE_FILTERS_QUERY,
  INVOICE_ID,
  INVOICE_IDEMPOTENCY_KEY,
  INVOICE_SUMMARY,
  createBillingHttpFixture,
  createBillingInvoiceRequest,
  getBillingInvoiceRequest,
  listEligibleCtesRequest,
  responseApiError,
} from '../fixtures/billing-http.fixture.js'

describe('Billing HTTP create and query contract', () => {
  test('rejects tenant selectors and unknown create fields before application work', async () => {
    for (const body of [
      { companyId: 'attacker-company' },
      { cteIds: [CTE_ID_PRIMARY], dueDate: '2026-08-05', unknown: true },
    ]) {
      const fixture = await createBillingHttpFixture()
      const response = await fixture.handle(createBillingInvoiceRequest({ body }))
      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.createCalls).toEqual([])
    }
  })

  test('creates a strict invoice with authenticated tenant and idempotency key', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(createBillingInvoiceRequest())
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toEqual({ data: INVOICE_SUMMARY })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(JSON.stringify(body)).not.toContain('<cte')
    expect(JSON.stringify(body)).not.toContain('storageKey')
    expect(fixture.createCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'billing-http-correlation',
        cteIds: ['00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000712'],
        dueDate: '2026-08-05',
        idempotencyKey: INVOICE_IDEMPOTENCY_KEY,
      },
    ])
  })

  test('lists eligible CT-es with cursor filters and returns sanitized invoice detail', async () => {
    const fixture = await createBillingHttpFixture()

    const listResponse = await fixture.handle(listEligibleCtesRequest())
    const detailResponse = await fixture.handle(getBillingInvoiceRequest())

    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toEqual({
      data: ELIGIBLE_CTES_PAGE.items,
      page: { nextCursor: ELIGIBLE_CTES_PAGE.nextCursor },
    })
    expect(detailResponse.status).toBe(200)
    expect(await detailResponse.json()).toEqual({ data: INVOICE_SUMMARY })
    expect(fixture.listEligibleCalls).toEqual([
      {
        batchId: '00000000-0000-4000-8000-000000000713',
        context: COMPANY_CONTEXT,
        cteNumber: '123456',
        cursor: 'eligible-cursor-001',
        customerDocument: '12345678000199',
        issuedFrom: '2026-07-01',
        issuedTo: '2026-07-31',
        limit: 25,
        maxAmount: '350.50',
        minAmount: '100.00',
      },
    ])
    expect(fixture.getCalls).toEqual([{ context: COMPANY_CONTEXT, invoiceId: INVOICE_ID }])
  })

  test('propagates safe not-found and conflict errors without tenant leakage', async () => {
    const detailFixture = await createBillingHttpFixture({
      getError: new ApiError({
        code: 'BILLING_INVOICE_NOT_FOUND',
        message: 'Billing invoice not found',
        status: 404,
      }),
    })
    const detailResponse = await detailFixture.handle(getBillingInvoiceRequest())
    const detailBody = await responseApiError(detailResponse)

    expect(detailResponse.status).toBe(404)
    expect(detailBody.error.code).toBe('BILLING_INVOICE_NOT_FOUND')
    expect(JSON.stringify(detailBody)).not.toContain(COMPANY_CONTEXT.companyId)

    const createFixture = await createBillingHttpFixture({
      createError: new ApiError({
        code: 'BILLING_CTE_ALREADY_INVOICED',
        message: 'CT-e already belongs to an active invoice',
        status: 409,
      }),
    })
    const createResponse = await createFixture.handle(createBillingInvoiceRequest())
    const createBody = await responseApiError(createResponse)

    expect(createResponse.status).toBe(409)
    expect(createBody.error.code).toBe('BILLING_CTE_ALREADY_INVOICED')
    expect(JSON.stringify(createBody)).not.toContain(COMPANY_CONTEXT.companyId)
  })

  test('documents billing routes explicitly', () => {
    expect(BILLING_ELIGIBLE_CTES_PATH).toBe('/billing/eligible-ctes')
    expect(BILLING_INVOICES_PATH).toBe('/billing/invoices')
    expect(`${BILLING_INVOICES_PATH}/${INVOICE_ID}`).toBe(
      '/billing/invoices/00000000-0000-4000-8000-000000000701',
    )
    expect(`${BILLING_INVOICES_PATH}/${INVOICE_ID}/documents`).toBe(
      '/billing/invoices/00000000-0000-4000-8000-000000000701/documents',
    )
    expect(`${BILLING_INVOICES_PATH}/${INVOICE_ID}/cancel`).toBe(
      '/billing/invoices/00000000-0000-4000-8000-000000000701/cancel',
    )
    expect(ELIGIBLE_FILTERS_QUERY).toBe(
      '?batchId=00000000-0000-4000-8000-000000000713&cteNumber=123456&customerDocument=12345678000199&issuedFrom=2026-07-01&issuedTo=2026-07-31&minAmount=100.00&maxAmount=350.50&limit=25&cursor=eligible-cursor-001',
    )
  })
})
