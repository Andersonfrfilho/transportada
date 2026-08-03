/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  INVOICE_ID,
  INVOICE_ITEMS,
  createBillingHttpFixture,
  getBillingInvoiceRequest,
} from '../fixtures/billing-http.fixture.js'

const FORBIDDEN_DETAIL_FIELDS: readonly string[] = [
  'companyId',
  'snapshot',
  'storageKey',
  'batchItemId',
  'xml',
]

describe('billing invoice items contract', () => {
  test('shows which CT-es the invoice covers, not only how many', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(getBillingInvoiceRequest())
    const body = (await response.json()) as {
      readonly data: {
        readonly itemCount: number
        readonly items: readonly Record<string, unknown>[]
      }
    }

    expect(response.status).toBe(200)
    expect(body.data.itemCount).toBe(INVOICE_ITEMS.length)
    expect(body.data.items).toEqual(INVOICE_ITEMS)
    expect(body.data.items[0]?.['cteNumber']).toBe('123456')
    expect(body.data.items[0]?.['accessKey']).toHaveLength(44)
  })

  test('breaks the amount down so the screen can show subtotal, discount and surcharge', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(getBillingInvoiceRequest())
    const body = (await response.json()) as { readonly data: Record<string, unknown> }

    expect(body.data['subtotalAmount']).toBe('350.50')
    expect(body.data['discountAmount']).toBe('0.00')
    expect(body.data['surchargeAmount']).toBe('0.00')
    expect(body.data['totalAmount']).toBe('350.50')
    expect(body.data['observations']).toBe('')
  })

  test('keeps internal and fiscal payload fields out of the detail', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(getBillingInvoiceRequest())
    const payload = await response.text()

    for (const field of FORBIDDEN_DETAIL_FIELDS) {
      expect(payload).not.toContain(field)
    }
    expect(fixture.getCalls).toEqual([{ context: COMPANY_CONTEXT, invoiceId: INVOICE_ID }])
  })
})
