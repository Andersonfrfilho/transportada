/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  CANCELLED_INVOICE_SUMMARY,
  COMPANY_CONTEXT,
  DOCUMENTS_PAGE,
  GENERATED_DOCUMENT,
  READ_ONLY_CONTEXT,
  createBillingHttpFixture,
  cancelBillingInvoiceRequest,
  generateBillingDocumentRequest,
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

  test('generates the invoice PDF and answers with a signed URL, never the storage key', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(generateBillingDocumentRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body).toEqual({ data: GENERATED_DOCUMENT })
    expect(JSON.stringify(body)).not.toContain('objectKey')
    expect(JSON.stringify(body)).not.toContain('tenants/')
    expect(fixture.generateDocumentCalls).toEqual([
      { context: COMPANY_CONTEXT, invoiceId: '00000000-0000-4000-8000-000000000701' },
    ])
  })

  test('generating a document requires the billing create permission', async () => {
    const fixture = await createBillingHttpFixture({ permissions: READ_ONLY_CONTEXT.permissions })

    const response = await fixture.handle(generateBillingDocumentRequest())

    expect(response.status).toBe(403)
    expect(fixture.generateDocumentCalls).toHaveLength(0)
  })

  test('propagates the fiscal profile error from a failed generation', async () => {
    const fixture = await createBillingHttpFixture({
      generateDocumentError: new ApiError({
        code: 'BILLING_INVOICE_FISCAL_PROFILE_MISSING',
        message: 'Company fiscal profile is required',
        status: 422,
      }),
    })

    const response = await fixture.handle(generateBillingDocumentRequest())
    const body = await responseApiError(response)

    expect(response.status).toBe(422)
    expect(body.error.code).toBe('BILLING_INVOICE_FISCAL_PROFILE_MISSING')
    expect(JSON.stringify(body)).not.toContain(COMPANY_CONTEXT.companyId)
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
