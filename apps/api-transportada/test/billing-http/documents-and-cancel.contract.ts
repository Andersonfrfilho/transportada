/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  CANCELLED_INVOICE_SUMMARY,
  COMPANY_CONTEXT,
  DOCUMENTS_PAGE,
  createBillingHttpFixture,
  cancelBillingInvoiceRequest,
  listBillingDocumentsRequest,
  responseApiError,
} from '../fixtures/billing-http.fixture.js'

describe('Billing HTTP documents and cancel contract', () => {
  test('returns temporary document URLs without embedding XML or storage keys', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(listBillingDocumentsRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body).toEqual({
      data: DOCUMENTS_PAGE.items,
      page: { nextCursor: DOCUMENTS_PAGE.nextCursor },
    })
    expect(JSON.stringify(body)).toContain('downloadUrl')
    expect(JSON.stringify(body)).not.toContain('<cte')
    expect(JSON.stringify(body)).not.toContain('storageKey')
    expect(fixture.listDocumentCalls).toEqual([
      { context: COMPANY_CONTEXT, invoiceId: '00000000-0000-4000-8000-000000000701' },
    ])
  })

  test('cancels an issued invoice with a bounded audit reason', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(cancelBillingInvoiceRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: CANCELLED_INVOICE_SUMMARY })
    expect(fixture.cancelCalls).toEqual([
      {
        correlationId: 'billing-http-correlation',
        context: COMPANY_CONTEXT,
        invoiceId: '00000000-0000-4000-8000-000000000701',
        reason: 'Cancelamento operacional por ajuste de cobranca',
      },
    ])
  })

  test('propagates safe not-found and invalid-state errors without tenant leakage', async () => {
    for (const error of [
      new ApiError({
        code: 'BILLING_INVOICE_NOT_FOUND',
        message: 'Billing invoice not found',
        status: 404,
      }),
      new ApiError({
        code: 'BILLING_INVOICE_INVALID_STATE',
        message: 'Billing invoice cannot be cancelled',
        status: 409,
      }),
    ]) {
      const fixture = await createBillingHttpFixture({ cancelError: error })
      const response = await fixture.handle(cancelBillingInvoiceRequest())
      const body = await responseApiError(response)

      expect(response.status).toBe(error.status)
      expect(body.error.code).toBe(error.code)
      expect(JSON.stringify(body)).not.toContain(COMPANY_CONTEXT.companyId)
    }
  })
})
