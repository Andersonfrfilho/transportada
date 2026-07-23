/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  AUDIT_EVENTS,
  OPERATIONS_JOBS,
  OPERATIONS_SUMMARY,
  OPERATIONS_TIMELINE,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  TARGET_ID,
  loadFutureModule,
} from './operations.fixture'

describe('operations client and queries contract', () => {
  test('uses authenticated no-store requests for summary, timeline, jobs and audit', async () => {
    const requests: Request[] = []
    const { createOperationsClient } = await loadFutureModule<OperationsClientModule>(
      '../../src/modules/operations/shared/operationsClient.service',
    )
    const client = createOperationsClient({
      apiUrl: 'https://api.example.test',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return resolveSyntheticResponse(request)
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(await client.getSummary({ module: 'cte_issuance' })).toEqual(OPERATIONS_SUMMARY)
    expect(
      await client.listTimeline({
        cursor: SYNTHETIC_CURSOR,
        entityId: TARGET_ID,
        entityType: 'nfe_import',
        limit: 25,
        module: 'nfe',
      }),
    ).toEqual(OPERATIONS_TIMELINE)
    expect(await client.listJobs({ limit: 100, module: 'cte_issuance' })).toEqual(OPERATIONS_JOBS)
    expect(
      await client.listAuditEvents({
        action: 'billing.invoice.cancel',
        limit: 50,
        targetId: TARGET_ID,
        targetType: 'billing_invoice',
      }),
    ).toEqual(AUDIT_EVENTS)

    expect(requests.map((request) => request.method)).toEqual(['GET', 'GET', 'GET', 'GET'])
    expect(requests.every((request) => request.cache === 'no-store')).toBe(true)
    expect(
      requests.every(
        (request) => request.headers.get('authorization') === `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
      ),
    ).toBe(true)
    expect(requests[0]?.url).toBe('https://api.example.test/operations/summary?module=cte_issuance')
    expect(requests[1]?.url).toContain('/operations/timeline?')
    expect(requests[1]?.url).toContain(`cursor=${encodeURIComponent(SYNTHETIC_CURSOR)}`)
    expect(requests[2]?.url).toBe(
      'https://api.example.test/operations/jobs?limit=100&module=cte_issuance',
    )
    expect(requests[3]?.url).toContain('/audit/events?')
  })

  test('keeps response DTO boundaries strict and rejects sensitive fields', async () => {
    const { createOperationsResponseAdapters } = await loadFutureModule<OperationsAdaptersModule>(
      '../../src/modules/operations/shared/operationsResponse.validation',
    )
    const adapters = createOperationsResponseAdapters()

    expect(() =>
      adapters.summaryFromApi({ data: { ...OPERATIONS_SUMMARY, companyId: 'forbidden-company' } }),
    ).toThrow('OPERATIONS_INVALID_SUMMARY_RESPONSE')
    expect(() =>
      adapters.timelinePageFromApi({
        data: [{ ...OPERATIONS_TIMELINE.items[0], xml: '<cteProc />' }],
        page: { nextCursor: null },
      }),
    ).toThrow('OPERATIONS_INVALID_TIMELINE_RESPONSE')
    expect(() =>
      adapters.jobsPageFromApi({
        data: [{ ...OPERATIONS_JOBS.items[0], certificatePassword: 'secret' }],
        page: { nextCursor: null },
      }),
    ).toThrow('OPERATIONS_INVALID_JOBS_RESPONSE')
    expect(() =>
      adapters.auditPageFromApi({
        data: [{ ...AUDIT_EVENTS.items[0], token: 'secret-token' }],
        page: { nextCursor: null },
      }),
    ).toThrow('OPERATIONS_INVALID_AUDIT_RESPONSE')
  })
})

function resolveSyntheticResponse(request: Request): Promise<Response> {
  if (request.url.includes('/operations/summary?')) {
    return Promise.resolve(Response.json({ data: OPERATIONS_SUMMARY }))
  }
  if (request.url.includes('/operations/timeline?')) {
    return Promise.resolve(
      Response.json({
        data: OPERATIONS_TIMELINE.items,
        page: { nextCursor: OPERATIONS_TIMELINE.nextCursor },
      }),
    )
  }
  if (request.url.includes('/operations/jobs?')) {
    return Promise.resolve(
      Response.json({
        data: OPERATIONS_JOBS.items,
        page: { nextCursor: OPERATIONS_JOBS.nextCursor },
      }),
    )
  }
  if (request.url.includes('/audit/events?')) {
    return Promise.resolve(
      Response.json({ data: AUDIT_EVENTS.items, page: { nextCursor: AUDIT_EVENTS.nextCursor } }),
    )
  }
  throw new Error(`Unexpected request in contract: ${request.url}`)
}

type OperationsClient = {
  readonly getSummary: (input: Record<string, unknown>) => Promise<unknown>
  readonly listAuditEvents: (input: Record<string, unknown>) => Promise<unknown>
  readonly listJobs: (input: Record<string, unknown>) => Promise<unknown>
  readonly listTimeline: (input: Record<string, unknown>) => Promise<unknown>
}

type OperationsClientModule = {
  readonly createOperationsClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => OperationsClient
}

type OperationsAdaptersModule = {
  readonly createOperationsResponseAdapters: () => {
    readonly auditPageFromApi: (input: unknown) => unknown
    readonly jobsPageFromApi: (input: unknown) => unknown
    readonly summaryFromApi: (input: unknown) => unknown
    readonly timelinePageFromApi: (input: unknown) => unknown
  }
}
