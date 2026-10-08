/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { act } from 'react'

import { useTripReportExport } from '@/modules/trip/hooks/useTripReportExport.hook'
import { TripReportTooLargeError } from '@/modules/trip/shared/tripReport.service'
import type {
  TripReportFetchPage,
  TripReportPageInput,
  TripReportRow,
} from '@/modules/trip/shared/tripReport.types'

import { renderHook, waitFor } from './renderHook.helper'

function buildRow(index: number): TripReportRow {
  return {
    accessKey: `key-${index}`,
    contractorName: null,
    documentNumber: String(index),
    documentSeries: '1',
    documentStatus: 'pending',
    recipientCity: null,
    recipientName: 'Recipient',
    recipientState: null,
    tone: 'warehouse',
    tripId: 'trip-1',
  }
}

function buildPagedFetch(calls: TripReportPageInput[]): TripReportFetchPage {
  return (pageInput) => {
    calls.push(pageInput)
    const pageIndex = pageInput.cursor === null ? 0 : Number(pageInput.cursor)
    const isLast = pageIndex === 2
    return Promise.resolve({
      excludedWithoutTrip: 3,
      nextCursor: isLast ? null : String(pageIndex + 1),
      rows: [buildRow(pageIndex * 2), buildRow(pageIndex * 2 + 1)],
      total: 6,
    })
  }
}

describe('useTripReportExport (spec 253 T4.1)', () => {
  test('selected trips win over the current filters', async () => {
    const calls: TripReportPageInput[] = []
    const rendered = await renderHook(() =>
      useTripReportExport({
        fetchPage: buildPagedFetch(calls),
        scope: { filters: { search: 'abc' }, selectedTripIds: ['trip-1', 'trip-2'] },
      }),
    )
    await act(() => rendered.result().exportReport())
    expect(calls[0]?.filters).toEqual({ tripIdIn: ['trip-1', 'trip-2'] })
    rendered.unmount()
  })

  test('without selection the current filters go; document ids serve the notes tab', async () => {
    const calls: TripReportPageInput[] = []
    const filtered = await renderHook(() =>
      useTripReportExport({
        fetchPage: buildPagedFetch(calls),
        scope: { filters: { search: 'abc' } },
      }),
    )
    await act(() => filtered.result().exportReport())
    expect(calls[0]?.filters).toEqual({ search: 'abc' })
    filtered.unmount()

    const byDocuments = await renderHook(() =>
      useTripReportExport({
        fetchPage: buildPagedFetch(calls),
        scope: { documentIds: ['document-1'], filters: { search: 'abc' } },
      }),
    )
    await act(() => byDocuments.result().exportReport())
    expect(calls.at(-1)?.filters).toEqual({ documentIdIn: ['document-1'] })
    byDocuments.unmount()
  })

  test('walks every page by cursor with limit 100 and hands the rows to the builder', async () => {
    const calls: TripReportPageInput[] = []
    const built: number[] = []
    const rendered = await renderHook(() =>
      useTripReportExport({
        buildSpreadsheet: (result) => {
          built.push(result.rows.length, result.excludedWithoutTrip)
        },
        fetchPage: buildPagedFetch(calls),
        scope: {},
      }),
    )
    await act(() => rendered.result().exportReport())
    expect(calls.map((call) => call.cursor)).toEqual([null, '1', '2'])
    expect(calls.every((call) => call.limit === 100)).toBe(true)
    expect(built).toEqual([6, 3])
    expect(rendered.result().isExporting).toBe(false)
    rendered.unmount()
  })

  test('reports progress while pages arrive', async () => {
    const seen: string[] = []
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const rendered = await renderHook(() => {
      const hook = useTripReportExport({
        fetchPage: async (pageInput) => {
          if (pageInput.cursor === '1') await gate
          return buildPagedFetch([])(pageInput)
        },
        scope: {},
      })
      if (hook.progress !== undefined) seen.push(`${hook.progress.loaded}/${hook.progress.total}`)
      return hook
    })
    const pending = act(() => rendered.result().exportReport())
    await waitFor(() => expect(seen).toContain('2/6'))
    release()
    await pending
    expect(rendered.result().progress).toBeUndefined()
    rendered.unmount()
  })

  test('422 TRIP_REPORT_TOO_LARGE exposes the ceiling', async () => {
    const rendered = await renderHook(() =>
      useTripReportExport({
        fetchPage: () => Promise.reject(new TripReportTooLargeError(5000)),
        scope: {},
      }),
    )
    await act(() => rendered.result().exportReport())
    await waitFor(() => expect(rendered.result().isTooLarge).toBe(true))
    expect(rendered.result().maxRows).toBe(5000)
    rendered.unmount()
  })

  test('a document selection above 100 runs sequential batches of 100 and concatenates', async () => {
    const calls: TripReportPageInput[] = []
    const documentIds = Array.from({ length: 250 }, (_, index) => `doc-${index}`)
    const rendered = await renderHook(() =>
      useTripReportExport({
        fetchPage: (pageInput) => {
          calls.push(pageInput)
          return Promise.resolve({
            excludedWithoutTrip: 2,
            nextCursor: null,
            rows: [buildRow(calls.length)],
            total: 1,
          })
        },
        scope: { documentIds },
      }),
    )
    const result = await act(() => rendered.result().exportReport())
    expect(calls.map((call) => call.filters.documentIdIn?.length)).toEqual([100, 100, 50])
    expect(calls[0]?.filters.documentIdIn?.[0]).toBe('doc-0')
    expect(calls[2]?.filters.documentIdIn?.[49]).toBe('doc-249')
    expect(result?.rows.length).toBe(3)
    expect(result?.excludedWithoutTrip).toBe(6)
    rendered.unmount()
  })

  test('cancelling aborts, stops fetching and leaves no error', async () => {
    const calls: TripReportPageInput[] = []
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const rendered = await renderHook(() =>
      useTripReportExport({
        fetchPage: async (pageInput) => {
          calls.push(pageInput)
          await gate
          return { nextCursor: 'more', rows: [buildRow(0)] }
        },
        scope: {},
      }),
    )
    const pending = act(() => rendered.result().exportReport())
    await waitFor(() => expect(calls.length).toBe(1))
    act(() => {
      rendered.result().cancelExport()
    })
    release()
    await pending
    expect(calls.length).toBe(1)
    expect(rendered.result().error).toBeUndefined()
    expect(rendered.result().isExporting).toBe(false)
    rendered.unmount()
  })
})
