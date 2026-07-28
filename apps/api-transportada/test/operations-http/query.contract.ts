/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  JOBS_PAGE,
  SUMMARY_RESULT,
  TIMELINE_PAGE,
  createOperationsHttpFixture,
  listJobsRequest,
  listTimelineRequest,
  summaryRequest,
} from '../fixtures/operations-http.fixture.js'

describe('Operations HTTP query contract', () => {
  test('returns operational summary with strict tenant context and no-store', async () => {
    const fixture = await createOperationsHttpFixture()

    const response = await fixture.handle(summaryRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ data: SUMMARY_RESULT })
    expect(fixture.summaryCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        filters: {
          correlationId: 'correlation-operations-001',
          from: '2026-07-23T00:00:00.000Z',
          module: 'cte_issuance',
          status: 'retry_scheduled',
          to: '2026-07-23T23:59:59.999Z',
        },
      },
    ])
  })

  test('returns timeline page with cursor, filters and sensitive fields omitted', async () => {
    const fixture = await createOperationsHttpFixture()

    const response = await fixture.handle(listTimelineRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      data: TIMELINE_PAGE.items,
      page: { nextCursor: TIMELINE_PAGE.nextCursor },
    })
    expect(JSON.stringify(body)).not.toContain('<cteProc>')
    expect(JSON.stringify(body)).not.toContain('storageKey')
    expect(fixture.timelineCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: '2026-07-23T14:00:00.000Z::00000000-0000-4000-8000-000000000001',
        filters: {
          correlationId: 'correlation-operations-001',
          entityId: '00000000-0000-4000-8000-000000000010',
          entityType: 'nfe_import',
          module: 'nfe',
        },
        limit: 25,
      },
    ])
  })

  test('returns jobs page with bounded limit and no automatic reprocess effect', async () => {
    const fixture = await createOperationsHttpFixture()

    const response = await fixture.handle(listJobsRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ data: JOBS_PAGE.items, page: { nextCursor: JOBS_PAGE.nextCursor } })
    expect(fixture.jobCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: null,
        filters: {
          correlationId: 'correlation-operations-001',
          module: 'cte_issuance',
          status: 'retry_scheduled',
        },
        limit: 100,
      },
    ])
    expect(fixture.reprocessCalls).toEqual([])
  })
})
