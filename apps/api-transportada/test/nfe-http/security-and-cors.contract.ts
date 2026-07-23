/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { READ_ONLY_CONTEXT } from '../fixtures/nfe-import-application.fixture'
import { createNfeHttpFixture, unauthenticatedError } from '../fixtures/nfe-http.fixture'
import {
  distributionRequest,
  documentXmlRequest,
  responseApiError,
  uploadImportRequest,
} from '../fixtures/nfe-http-request.fixture'

describe('nfe http security and cors contract', () => {
  test('rejects unauthenticated upload and keeps no-store headers', async () => {
    const fixture = await createNfeHttpFixture({ authenticationError: unauthenticatedError() })

    const response = await fixture.handle(uploadImportRequest())

    expect(response.status).toBe(401)
    expect((await responseApiError(response)).error.code).toBe('UNAUTHENTICATED')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.requestUploadCalls).toEqual([])
  })

  test('rejects upload for read-only users before multipart parsing', async () => {
    const events: string[] = []
    const fixture = await createNfeHttpFixture({ permissions: READ_ONLY_CONTEXT.permissions })

    const response = await fixture.handle(uploadImportRequest({ events }))

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(events).not.toContain('body')
    expect(events).not.toContain('formData')
    expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize'])
  })

  test('allows read-only users to download xml with no-store and cors headers', async () => {
    const fixture = await createNfeHttpFixture({ permissions: READ_ONLY_CONTEXT.permissions })

    const response = await fixture.handle(
      documentXmlRequest(undefined, { origin: 'http://localhost:53000' }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:53000')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  test('rejects distribution for read-only users without reaching the application', async () => {
    const fixture = await createNfeHttpFixture({ permissions: READ_ONLY_CONTEXT.permissions })

    const response = await fixture.handle(distributionRequest())

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).error.code).toBe('FORBIDDEN')
    expect(fixture.requestDistributionCalls).toEqual([])
  })
})
