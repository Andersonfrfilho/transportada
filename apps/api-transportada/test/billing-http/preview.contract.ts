/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  CTE_ID_PRIMARY,
  CTE_ID_SECONDARY,
  INVOICE_PREVIEW,
  READ_ONLY_CONTEXT,
  createBillingHttpFixture,
  previewBillingInvoiceRequest,
  responseApiError,
} from '../fixtures/billing-http.fixture.js'

function cteIdAt(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

describe('Billing HTTP invoice preview contract', () => {
  test('answers the grouped preview without cache and without fiscal payload', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(previewBillingInvoiceRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ data: INVOICE_PREVIEW })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(JSON.stringify(body)).not.toContain('<cte')
    expect(JSON.stringify(body)).not.toContain('storageKey')
    expect(fixture.previewCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cteIds: [CTE_ID_PRIMARY, CTE_ID_SECONDARY],
      },
    ])
  })

  test('rejects every malformed selection before reaching the application', async () => {
    for (const body of [
      {},
      { cteIds: [] },
      { cteIds: [CTE_ID_PRIMARY, CTE_ID_PRIMARY] },
      { cteIds: ['not-a-uuid'] },
      { cteIds: Array.from({ length: 101 }, (_, index) => cteIdAt(index + 1)) },
      { cteIds: [CTE_ID_PRIMARY], dueDate: '2026-08-05' },
      { companyId: 'attacker-company', cteIds: [CTE_ID_PRIMARY] },
    ]) {
      const fixture = await createBillingHttpFixture()

      const response = await fixture.handle(previewBillingInvoiceRequest({ body }))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
      expect(fixture.previewCalls).toEqual([])
    }
  })

  test('accepts the maximum selection of one hundred CT-es', async () => {
    const fixture = await createBillingHttpFixture()

    const response = await fixture.handle(
      previewBillingInvoiceRequest({
        body: { cteIds: Array.from({ length: 100 }, (_, index) => cteIdAt(index + 1)) },
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.previewCalls).toHaveLength(1)
    expect(fixture.previewCalls[0]?.cteIds).toHaveLength(100)
  })

  test('requires the billing create permission', async () => {
    const fixture = await createBillingHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(previewBillingInvoiceRequest())

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(fixture.previewCalls).toEqual([])
  })
})
