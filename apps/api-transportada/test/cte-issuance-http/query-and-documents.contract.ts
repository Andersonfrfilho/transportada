/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  DOCUMENTS_PAGE,
  ISSUANCE_SUMMARY,
  createCteIssuanceHttpFixture,
  getIssuanceRequest,
  listDocumentsRequest,
  responseApiError,
} from '../fixtures/cte-issuance-http.fixture.js'

describe('CT-e issuance HTTP query and documents contract', () => {
  test('returns sanitized issuance status with no-store and without XML payloads', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    const response = await fixture.handle(getIssuanceRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body).toEqual({ data: ISSUANCE_SUMMARY })
    expect(JSON.stringify(body)).not.toContain('<cte')
    expect(JSON.stringify(body)).not.toContain('certificate')
    expect(fixture.getCalls).toEqual([
      { batchId: BATCH_ID, batchItemId: BATCH_ITEM_ID, context: COMPANY_CONTEXT },
    ])
  })

  test('returns temporary document URLs without embedding XML in API responses', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    const response = await fixture.handle(listDocumentsRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body).toEqual({ data: DOCUMENTS_PAGE.items, page: { nextCursor: null } })
    expect(JSON.stringify(body)).toContain('downloadUrl')
    expect(JSON.stringify(body)).not.toContain('<cte')
    expect(JSON.stringify(body)).not.toContain('storageKey')
    expect(fixture.listDocumentCalls).toEqual([
      { batchId: BATCH_ID, batchItemId: BATCH_ITEM_ID, context: COMPANY_CONTEXT },
    ])
  })

  test('keeps anti-enumeration for missing or cross-tenant item lookups', async () => {
    const notFound = new ApiError({
      code: 'CTE_ISSUANCE_NOT_FOUND',
      message: 'CT-e issuance not found',
      status: 404,
    })
    const fixture = await createCteIssuanceHttpFixture({ getError: notFound })

    const response = await fixture.handle(getIssuanceRequest())
    const body = await responseApiError(response)

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('CTE_ISSUANCE_NOT_FOUND')
    expect(JSON.stringify(body)).not.toContain(COMPANY_CONTEXT.companyId)
  })
})
