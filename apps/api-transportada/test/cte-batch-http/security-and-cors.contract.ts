import { describe, expect, test } from 'bun:test'

import {
  FRONTEND_ORIGIN,
  MANAGE_ONLY_CONTEXT,
  READ_ONLY_CONTEXT,
  createBatchRequest,
  createCteBatchHttpFixture,
  responseApiError,
  submitBatchRequest,
  unauthenticatedError,
} from '../fixtures/cte-batch-http.fixture.js'

describe('CT-e batch HTTP security and CORS contract', () => {
  test('rejects unauthenticated batch creation and keeps no-store headers', async () => {
    const fixture = await createCteBatchHttpFixture({
      authenticationError: unauthenticatedError(),
    })

    const response = await fixture.handle(createBatchRequest())

    expect(response.status).toBe(401)
    expect((await responseApiError(response)).error.code).toBe('UNAUTHENTICATED')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.createCalls).toEqual([])
  })

  test('requires cte.manage before parsing batch create bodies', async () => {
    const events: string[] = []
    const fixture = await createCteBatchHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(createBatchRequest({ events, origin: FRONTEND_ORIGIN }))

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(events).not.toContain('body')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(fixture.createCalls).toEqual([])
  })

  test('requires cte.submit before parsing submit bodies', async () => {
    const events: string[] = []
    const fixture = await createCteBatchHttpFixture({
      permissions: MANAGE_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(submitBatchRequest({ events }))

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(events).not.toContain('body')
    expect(fixture.submitCalls).toEqual([])
  })
})
