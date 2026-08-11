/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createCteBatchItemClient } from '@/modules/cte-batch/shared/cteBatchItemClient.service'
import { createCompanyCteItemSummaryAdapter } from '@/modules/cte-batch/shared/cteBatchItem.validation'
import {
  CTE_ITEM_DEFAULT_PAGE_SIZE,
  CTE_ITEM_PAGE_SIZES,
  EMPTY_CTE_ITEM_FILTERS,
  parseCteItemPageSize,
  serializeCteItemSummaryQuery,
} from '@/modules/cte-batch/shared/cteBatchItemTable.service'
import {
  CTE_BATCH_PROGRESS_INTERVAL_MS,
  resolveCteItemSummaryInterval,
  resolveCteItemTransmissionSummary,
} from '@/modules/cte-batch/shared/cteBatchProgress.service'
import type { CompanyCteItemSummary } from '@/modules/cte-batch/shared/cteBatchItem.types'

import { SYNTHETIC_ACCESS_TOKEN } from './cte-batch.fixture'

const BATCH_ID = '00000000-0000-4000-8000-000000000601'
const OTHER_BATCH_ID = '00000000-0000-4000-8000-000000000602'

const SUMMARY: CompanyCteItemSummary = {
  baseAmount: '167000.0000',
  batchIds: [BATCH_ID],
  batchIdsTruncated: false,
  count: 167,
  statusCounts: { authorized: 120, pending: 47 },
  totalAmount: '7515.0000',
}

function summaryWith(changes: Readonly<Partial<CompanyCteItemSummary>>): CompanyCteItemSummary {
  return { ...SUMMARY, ...changes }
}

describe('cte item summary contract', () => {
  test('carries the filter cut, never the page cursor nor the page size', () => {
    const search = new URLSearchParams(
      serializeCteItemSummaryQuery({
        batchIdIn: [BATCH_ID, OTHER_BATCH_ID],
        filters: { ...EMPTY_CTE_ITEM_FILTERS, statuses: ['authorized'] },
      }),
    )

    expect(search.get('batchIdIn')).toBe(`${BATCH_ID},${OTHER_BATCH_ID}`)
    expect(search.get('statusIn')).toBe('authorized')
    expect(search.has('cursor')).toBe(false)
    expect(search.has('limit')).toBe(false)
    expect(serializeCteItemSummaryQuery({})).toBe('')
  })

  test('reads the summary from the authenticated no-store endpoint', async () => {
    const requests: Request[] = []
    const client = createCteBatchItemClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        requests.push(new Request(input, init))
        return Promise.resolve(Response.json({ data: SUMMARY }))
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(await client.summarizeCompanyItems({ batchIdIn: [BATCH_ID] })).toEqual(SUMMARY)

    const request = requests[0]
    if (request === undefined) throw new Error('CTE_ITEM_SUMMARY_CONTRACT_REQUEST_MISSING')
    expect(request.url.startsWith('https://api.example.test/cte-batch-items/summary?')).toBe(true)
    expect(request.method).toBe('GET')
    expect(request.cache).toBe('no-store')
    expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(new URL(request.url).searchParams.has('companyId')).toBe(false)
  })

  test('refuses a summary payload that is not the shape the screen sums', () => {
    const adapter = createCompanyCteItemSummaryAdapter()

    expect(adapter({ data: SUMMARY })).toEqual(SUMMARY)
    expect(() => adapter({ data: { ...SUMMARY, count: '167' } })).toThrow()
    expect(() => adapter({ data: { ...SUMMARY, batchIds: [1] } })).toThrow()
    expect(() => adapter({ data: { ...SUMMARY, statusCounts: { authorized: '120' } } })).toThrow()
    expect(() => adapter({ data: { ...SUMMARY, unexpected: true } })).toThrow()
  })

  test('measures the transmission by CT-e, not by batch', () => {
    const progress = resolveCteItemTransmissionSummary(SUMMARY)

    expect(progress.total).toBe(167)
    expect(progress.transmitting).toBe(47)
    expect(progress.settled).toBe(120)
    expect(progress.percent).toBe(72)
    expect(progress.isComplete).toBe(false)

    const finished = resolveCteItemTransmissionSummary(
      summaryWith({ statusCounts: { authorized: 167 } }),
    )
    expect(finished.percent).toBe(100)
    expect(finished.isComplete).toBe(true)
  })

  test('a cut with nothing in flight stops polling', () => {
    expect(resolveCteItemSummaryInterval(undefined)).toBe(false)
    expect(resolveCteItemSummaryInterval(SUMMARY)).toBe(CTE_BATCH_PROGRESS_INTERVAL_MS)
    expect(resolveCteItemSummaryInterval(summaryWith({ statusCounts: { authorized: 167 } }))).toBe(
      false,
    )
    expect(resolveCteItemSummaryInterval(summaryWith({ statusCounts: { in_flight: 1 } }))).toBe(
      CTE_BATCH_PROGRESS_INTERVAL_MS,
    )
    expect(
      resolveCteItemSummaryInterval(summaryWith({ statusCounts: { retry_scheduled: 1 } })),
    ).toBe(CTE_BATCH_PROGRESS_INTERVAL_MS)
  })

  test('never asks the API for a page bigger than it accepts', () => {
    expect(CTE_ITEM_PAGE_SIZES.every((size) => size <= 100)).toBe(true)
    expect(CTE_ITEM_PAGE_SIZES).toContain(CTE_ITEM_DEFAULT_PAGE_SIZE)
    expect(parseCteItemPageSize('100')).toBe(100)
    expect(parseCteItemPageSize('250')).toBe(CTE_ITEM_DEFAULT_PAGE_SIZE)
    expect(parseCteItemPageSize('nada')).toBe(CTE_ITEM_DEFAULT_PAGE_SIZE)
  })
})
