/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  AUDIT_EVENTS_PATH,
  FRONTEND_ORIGIN,
  OPERATIONS_ONLY_CONTEXT,
  READ_ONLY_CONTEXT,
  createOperationsHttpFixture,
  listAuditEventsRequest,
  listJobsRequest,
  responseApiError,
  summaryRequest,
  unauthenticatedError,
} from '../fixtures/operations-http.fixture.js'

describe('Operations HTTP security and CORS contract', () => {
  test('rejects unauthenticated summary and keeps no-store headers', async () => {
    const fixture = await createOperationsHttpFixture({
      authenticationError: unauthenticatedError(),
    })

    const response = await fixture.handle(summaryRequest())

    expect(response.status).toBe(401)
    expect((await responseApiError(response)).error.code).toBe('UNAUTHENTICATED')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.summaryCalls).toEqual([])
  })

  test('requires operations.read before handling jobs filters', async () => {
    const fixture = await createOperationsHttpFixture({
      permissions: new Set(),
    })

    const response = await fixture.handle(listJobsRequest({ origin: FRONTEND_ORIGIN }))

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(fixture.jobCalls).toEqual([])
  })

  test('requires audit.read before audit filter work', async () => {
    const fixture = await createOperationsHttpFixture({
      permissions: OPERATIONS_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(
      listAuditEventsRequest({
        query: '?metadata=%3Cxml%3Eexpensive%3C%2Fxml%3E&limit=25',
      }),
    )

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(fixture.auditCalls).toEqual([])
  })

  test('documents the operations and audit routes explicitly', async () => {
    const fixture = await createOperationsHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    expect(await fixture.options()).toContainAllValues([
      'GET /operations/summary',
      'GET /operations/timeline',
      'GET /operations/jobs',
      `GET ${AUDIT_EVENTS_PATH}`,
    ])
  })
})
