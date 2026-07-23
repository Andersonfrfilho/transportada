/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  FRONTEND_ORIGIN,
  READ_ONLY_CONTEXT,
  createCteIssuanceHttpFixture,
  issueBatchRequest,
  reprocessItemRequest,
  responseApiError,
  unauthenticatedError,
} from '../fixtures/cte-issuance-http.fixture.js'

describe('CT-e issuance HTTP security and CORS contract', () => {
  test('rejects unauthenticated issue requests and keeps no-store headers', async () => {
    const fixture = await createCteIssuanceHttpFixture({
      authenticationError: unauthenticatedError(),
    })

    const response = await fixture.handle(issueBatchRequest())

    expect(response.status).toBe(401)
    expect((await responseApiError(response)).error.code).toBe('UNAUTHENTICATED')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.issueCalls).toEqual([])
  })

  test('requires cte.submit before parsing issue bodies', async () => {
    const events: string[] = []
    const fixture = await createCteIssuanceHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(issueBatchRequest({ events, origin: FRONTEND_ORIGIN }))

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(events).not.toContain('body')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(fixture.issueCalls).toEqual([])
  })

  test('requires cte.submit before parsing reprocess bodies', async () => {
    const events: string[] = []
    const fixture = await createCteIssuanceHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(reprocessItemRequest({ events }))

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(events).not.toContain('body')
    expect(fixture.reprocessCalls).toEqual([])
  })
})
