/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CREATE_ONLY_CONTEXT,
  FRONTEND_ORIGIN,
  READ_ONLY_CONTEXT,
  cancelBillingInvoiceRequest,
  createBillingHttpFixture,
  createBillingInvoiceRequest,
  responseApiError,
  unauthenticatedError,
} from '../fixtures/billing-http.fixture.js'

describe('Billing HTTP security and CORS contract', () => {
  test('rejects unauthenticated invoice creation and keeps no-store headers', async () => {
    const fixture = await createBillingHttpFixture({
      authenticationError: unauthenticatedError(),
    })

    const response = await fixture.handle(createBillingInvoiceRequest())

    expect(response.status).toBe(401)
    expect((await responseApiError(response)).error.code).toBe('UNAUTHENTICATED')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.createCalls).toEqual([])
  })

  test('requires billing.create before parsing invoice creation bodies', async () => {
    const events: string[] = []
    const fixture = await createBillingHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(
      createBillingInvoiceRequest({ events, origin: FRONTEND_ORIGIN }),
    )

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(events).not.toContain('body')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(fixture.createCalls).toEqual([])
  })

  test('requires billing.cancel before parsing cancellation bodies', async () => {
    const events: string[] = []
    const fixture = await createBillingHttpFixture({
      permissions: CREATE_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(cancelBillingInvoiceRequest({ events }))

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(events).not.toContain('body')
    expect(fixture.cancelCalls).toEqual([])
  })
})
