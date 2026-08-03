/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  INVOICE_ID,
  createBillingHttpFixture,
  getBillingInvoiceRequest,
  listBillingInvoicesRequest,
  listEligibleCtesRequest,
} from '../fixtures/billing-http.fixture.js'

/** O driver do Postgres devolve `numeric(14,2)` sem as casas quando a fração é zero. */
const DRIVER_INVOICE = {
  createdAt: '2026-07-23T12:00:00.000Z',
  customer: { document: '12345678000199', name: 'Transportes Sul Ltda' },
  discountAmount: '0',
  dueDate: '2026-08-05',
  id: INVOICE_ID,
  invoiceNumber: 17,
  issuedAt: '2026-07-23T12:00:00.000Z',
  itemCount: 2,
  items: [
    {
      accessKey: '35260711222333000181570010000000011000000015',
      cteNumber: '123456',
      description: 'Frete CT-e 123456',
      totalAmount: '150.5',
    },
    {
      accessKey: '35260711222333000181570010000000021000000023',
      cteNumber: '123457',
      description: 'Frete CT-e 123457',
      totalAmount: '200',
    },
  ],
  observations: '',
  status: 'issued',
  subtotalAmount: '350.5',
  surchargeAmount: '0',
  totalAmount: '350.5',
  updatedAt: '2026-07-23T12:00:00.000Z',
} as const

describe('Billing HTTP money serialization contract', () => {
  test('normalizes invoice amounts to two decimals when listing', async () => {
    const fixture = await createBillingHttpFixture({
      invoicesPage: { items: [DRIVER_INVOICE], nextCursor: null },
    })

    const response = await fixture.handle(listBillingInvoicesRequest())

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      readonly data: readonly Record<string, unknown>[]
    }
    expect(body.data[0]).toMatchObject({
      discountAmount: '0.00',
      subtotalAmount: '350.50',
      surchargeAmount: '0.00',
      totalAmount: '350.50',
    })
  })

  test('normalizes invoice and item amounts to two decimals when reading the detail', async () => {
    const fixture = await createBillingHttpFixture({ invoice: DRIVER_INVOICE })

    const response = await fixture.handle(getBillingInvoiceRequest())

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      readonly data: {
        readonly items: readonly Record<string, unknown>[]
        readonly totalAmount: string
      }
    }
    expect(body.data.totalAmount).toBe('350.50')
    expect(body.data.items.map((item) => item['totalAmount'])).toEqual(['150.50', '200.00'])
  })

  test('normalizes eligible CT-e amounts to two decimals', async () => {
    const fixture = await createBillingHttpFixture({
      eligiblePage: {
        items: [
          {
            batchId: '00000000-0000-4000-8000-000000000713',
            batchName: 'Lote CT-e julho',
            cteId: '00000000-0000-4000-8000-000000000711',
            cteNumber: '123456',
            customerDocument: '12345678000199',
            customerName: 'Transportes Sul Ltda',
            issuedAt: '2026-07-23T10:00:00.000Z',
            totalAmount: '150',
          },
        ],
        nextCursor: null,
      },
    })

    const response = await fixture.handle(listEligibleCtesRequest())

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      readonly data: readonly Record<string, unknown>[]
    }
    expect(body.data[0]?.['totalAmount']).toBe('150.00')
  })
})
