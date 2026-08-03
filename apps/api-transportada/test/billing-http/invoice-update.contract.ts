/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  COMPANY_CONTEXT,
  INVOICE_ID,
  READ_ONLY_CONTEXT,
  UPDATED_INVOICE_SUMMARY,
  createBillingHttpFixture,
  responseApiError,
  updateBillingInvoiceRequest,
} from '../fixtures/billing-http.fixture.js'

describe('Billing HTTP invoice update contract', () => {
  test('edits observations and amounts of an issued invoice', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(updateBillingInvoiceRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ data: UPDATED_INVOICE_SUMMARY })
    expect(fixture.updateCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'billing-http-correlation',
        discountAmount: '50.00',
        idempotencyKey: 'billing-http-key-0001',
        invoiceId: INVOICE_ID,
        observations: 'Desconto comercial negociado',
        surchargeAmount: '10.25',
      },
    ])
  })

  test('accepts a partial edition carrying a single field', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      updateBillingInvoiceRequest({ body: { observations: 'Ajuste combinado com o cliente' } }),
    )

    expect(response.status).toBe(200)
    expect(fixture.updateCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'billing-http-correlation',
        idempotencyKey: 'billing-http-key-0001',
        invoiceId: INVOICE_ID,
        observations: 'Ajuste combinado com o cliente',
      },
    ])
  })

  test('requires the billing create permission', async () => {
    const fixture = await createBillingHttpFixture({ permissions: READ_ONLY_CONTEXT.permissions })

    const response = await fixture.handle(updateBillingInvoiceRequest())

    expect(response.status).toBe(403)
    expect(fixture.updateCalls).toHaveLength(0)
  })

  test.each([
    ['unknown key', { cteIds: ['00000000-0000-4000-8000-000000000711'] }],
    ['empty payload', {}],
    ['non-object payload', ['50.00']],
    ['numeric discount', { discountAmount: 50 }],
    ['unrounded discount', { discountAmount: '50.001' }],
    ['negative discount', { discountAmount: '-50.00' }],
    ['negative surcharge', { surchargeAmount: '-10.25' }],
    ['non-string observations', { observations: 12 }],
    ['observations above the bound', { observations: 'a'.repeat(501) }],
    ['total sent by the client', { totalAmount: '310.75' }],
    ['status sent by the client', { status: 'cancelled' }],
    ['company sent by the client', { companyId: 'attacker-company', observations: 'x' }],
  ])('rejects an invalid edition payload: %s', async (_label, body) => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(updateBillingInvoiceRequest({ body }))
    const payload = await responseApiError(response)

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('INVALID_REQUEST')
    expect(fixture.updateCalls).toHaveLength(0)
  })

  test('rejects a body that is not declared as JSON', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      updateBillingInvoiceRequest({ contentType: 'text/plain' }),
    )

    expect(response.status).toBe(400)
    expect(fixture.updateCalls).toHaveLength(0)
  })

  test.each([
    ['missing', null],
    ['too short', 'short-key'],
    ['with invalid characters', `billing http key ${'0'.repeat(12)}`],
  ])('rejects an idempotency key %s', async (_label, idempotencyKey) => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(updateBillingInvoiceRequest({ idempotencyKey }))

    expect(response.status).toBe(400)
    expect(fixture.updateCalls).toHaveLength(0)
  })

  /** O roteador só casa `:id` canônico, então um identificador inválido nem chega à rota. */
  test('refuses an invoice identifier that is not a UUID', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      new Request('http://api.test/billing/invoices/not-a-uuid', {
        body: JSON.stringify({ observations: 'x' }),
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'idempotency-key': 'billing-http-key-0001',
        },
        method: 'PATCH',
      }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).error.code).toBe('NOT_FOUND')
    expect(fixture.updateCalls).toHaveLength(0)
  })

  test('propagates the domain refusals without leaking the tenant', async () => {
    for (const error of [
      new ApiError({
        code: 'BILLING_INVOICE_DISCOUNT_EXCEEDS_SUBTOTAL',
        message: 'Discount cannot exceed the invoice subtotal',
        status: 422,
      }),
      new ApiError({
        code: 'BILLING_INVOICE_INVALID_STATE',
        message: 'Billing invoice cannot be edited',
        status: 409,
      }),
      new ApiError({
        code: 'BILLING_INVOICE_NOT_FOUND',
        message: 'Billing invoice not found',
        status: 404,
      }),
    ]) {
      const fixture = await createBillingHttpFixture({ updateError: error })
      const response = await fixture.handle(updateBillingInvoiceRequest())
      const payload = await responseApiError(response)

      expect(response.status).toBe(error.status)
      expect(payload.error.code).toBe(error.code)
      expect(JSON.stringify(payload)).not.toContain(COMPANY_CONTEXT.companyId)
    }
  })
})
