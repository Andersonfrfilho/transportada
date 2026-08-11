/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  BATCH_ID,
  COMPANY_CONTEXT,
  COMPANY_ITEMS_SUMMARY,
  MANAGE_ONLY_CONTEXT,
  createCteBatchHttpFixture,
  responseApiError,
  summarizeCompanyItemsRequest,
} from '../fixtures/cte-batch-http.fixture.js'

const REJECTED_SEARCHES = [
  '?limit=25',
  '?cursor=2026-07-22T20:00:00.000Z::00000000-0000-4000-8000-000000000507',
  '?batchId=not-a-uuid',
  '?statusIn=teleported',
  '?companyId=00000000-0000-4000-8000-000000000999',
  '?unknownFilter=1',
  '?statusIn=pending&statusIn=authorized',
] as const

describe('CT-e item summary HTTP contract', () => {
  test('answers how many and how much the filter covers, not the visible page', async () => {
    const fixture = await createCteBatchHttpFixture()

    const response = await fixture.handle(summarizeCompanyItemsRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: COMPANY_ITEMS_SUMMARY })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.summarizeCompanyItemCalls).toEqual([{ context: COMPANY_CONTEXT }])
  })

  test('carries the same filters as the listing so both read the same cut', async () => {
    const fixture = await createCteBatchHttpFixture()

    await fixture.handle(
      summarizeCompanyItemsRequest({ search: `?batchIdIn=${BATCH_ID}&statusIn=pending` }),
    )

    expect(fixture.summarizeCompanyItemCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        filters: { batchIdIn: [BATCH_ID], statusIn: ['pending'] },
      },
    ])
  })

  test('rejects pagination and unknown or invalid filters', async () => {
    for (const search of REJECTED_SEARCHES) {
      const fixture = await createCteBatchHttpFixture()

      const response = await fixture.handle(summarizeCompanyItemsRequest({ search }))

      expect({ search, status: response.status }).toEqual({ search, status: 400 })
    }
  })

  test('requires the same permission as the listing it summarizes', async () => {
    const fixture = await createCteBatchHttpFixture({
      permissions: MANAGE_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(summarizeCompanyItemsRequest())

    expect(response.status).toBe(403)
    expect(fixture.summarizeCompanyItemCalls).toEqual([])
  })

  test('surfaces the use case failure without leaking internals', async () => {
    const fixture = await createCteBatchHttpFixture({
      summarizeCompanyItemsError: new ApiError({
        code: 'CTE_BATCH_ITEMS_UNAVAILABLE',
        message: 'items unavailable',
        status: 503,
      }),
    })

    const response = await fixture.handle(summarizeCompanyItemsRequest())

    expect(response.status).toBe(503)
    const body = await responseApiError(response)
    expect(body.error.code).toBe('CTE_BATCH_ITEMS_UNAVAILABLE')
    expect(body.error.message).toBe('items unavailable')
  })
})
