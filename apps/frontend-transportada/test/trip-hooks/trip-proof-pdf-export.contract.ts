/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'

import '@/modules/shared/i18n/i18n.service'
import { TripProofPdfExportButton } from '@/modules/trip/components/TripProofPdfExportButton.component'
import { useTripProofPdfExport } from '@/modules/trip/hooks/useTripProofPdfExport.hook'
import { buildTripExportFileName } from '@/modules/trip/shared/tripExportFileName.service'
import {
  buildTripProofPdfSearch,
  packTripProofPdfTrips,
  TripProofPdfTooLargeError,
  type TripProofPdfFetch,
  type TripProofPdfFetchRows,
} from '@/modules/trip/shared/tripProofPdf.service'

import { renderHook, renderWithQueryClient, waitFor } from './renderHook.helper'

type SavedFile = Readonly<{ blob: Blob; fileName: string }>

function buildIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `document-${index}`)
}

function buildTripRows(counts: Readonly<Record<string, number>>): { tripId: string }[] {
  return Object.entries(counts).flatMap(([tripId, count]) =>
    Array.from({ length: count }, () => ({ tripId })),
  )
}

const NO_ROWS: TripProofPdfFetchRows = () => Promise.resolve([])

describe('useTripProofPdfExport (spec 253 T4.6)', () => {
  test('saves the blob with a file name that carries no personal data', async () => {
    const saved: SavedFile[] = []
    const fetchPdf: TripProofPdfFetch = () => Promise.resolve(new Blob(['pdf']))
    const rendered = await renderHook(() =>
      useTripProofPdfExport({
        fetchPdf,
        savePdf: (file) => saved.push(file),
        scope: { selectedTripIds: ['trip-1'] },
      }),
    )
    await act(() => rendered.result().exportPdf())
    expect(saved).toHaveLength(1)
    expect(saved[0]?.fileName).toBe(
      buildTripExportFileName({ baseName: 'trip-proofs', extension: 'pdf' }),
    )
    expect(saved[0]?.fileName).toMatch(/^trip-proofs-\d{4}-\d{2}-\d{2}-\d{4}\.pdf$/)
    expect(rendered.result().error).toBeUndefined()
    expect(rendered.result().isExporting).toBe(false)
    rendered.unmount()
  })

  test('selected trips win over filters; documents serve the notes tab', async () => {
    const calls: Parameters<TripProofPdfFetch>[0][] = []
    const fetchPdf: TripProofPdfFetch = (input) => {
      calls.push(input)
      return Promise.resolve(new Blob())
    }
    const byTrips = await renderHook(() =>
      useTripProofPdfExport({
        fetchPdf,
        savePdf: () => undefined,
        scope: { filters: { search: 'abc' }, selectedTripIds: ['trip-1'] },
      }),
    )
    await act(() => byTrips.result().exportPdf())
    byTrips.unmount()
    const byDocuments = await renderHook(() =>
      useTripProofPdfExport({
        fetchPdf,
        savePdf: () => undefined,
        scope: { documentIds: ['document-1'] },
      }),
    )
    await act(() => byDocuments.result().exportPdf())
    byDocuments.unmount()
    expect(calls[0]?.filters).toEqual({ tripIdIn: ['trip-1'] })
    expect(calls[1]?.filters).toEqual({ documentIdIn: ['document-1'] })
  })

  test('422 exposes the limit and saves nothing', async () => {
    const saved: SavedFile[] = []
    const rendered = await renderHook(() =>
      useTripProofPdfExport({
        fetchPdf: () => Promise.reject(new TripProofPdfTooLargeError(200)),
        fetchRows: () => Promise.resolve(buildTripRows({ 'trip-huge': 300 })),
        savePdf: (file) => saved.push(file),
        scope: { filters: {} },
      }),
    )
    await act(() => rendered.result().exportPdf())
    await waitFor(() => expect(rendered.result().isTooLarge).toBe(true))
    expect(rendered.result().maxBlocks).toBe(200)
    expect(saved).toHaveLength(0)
    rendered.unmount()
  })

  test('cancel aborts without error and saves nothing', async () => {
    const saved: SavedFile[] = []
    const fetchPdf: TripProofPdfFetch = ({ signal }) =>
      new Promise<Blob>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    const rendered = await renderHook(() =>
      useTripProofPdfExport({
        fetchPdf,
        savePdf: (file) => saved.push(file),
        scope: { filters: {} },
      }),
    )
    let pending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      pending = rendered.result().exportPdf()
      await Promise.resolve()
    })
    await act(async () => {
      rendered.result().cancelExport()
      await pending
    })
    expect(rendered.result().error).toBeUndefined()
    expect(saved).toHaveLength(0)
    rendered.unmount()
  })

  test('more than 100 document ids go out as several PDFs of up to 100 notes', async () => {
    const saved: SavedFile[] = []
    const calls: Parameters<TripProofPdfFetch>[0][] = []
    const rendered = await renderHook(() =>
      useTripProofPdfExport({
        fetchPdf: (input) => {
          calls.push(input)
          return Promise.resolve(new Blob(['pdf']))
        },
        fetchRows: NO_ROWS,
        savePdf: (file) => saved.push(file),
        scope: { documentIds: buildIds(250) },
      }),
    )
    await act(() => rendered.result().exportPdf())
    expect(calls.map((call) => call.filters.documentIdIn?.length)).toEqual([100, 100, 50])
    expect(saved.map((file) => /^trip-proofs-part-(\d)-of-(\d)-/.exec(file.fileName)?.[0])).toEqual(
      [1, 2, 3].map((part) => expect.stringContaining(`part-${part}-of-3-`) as string),
    )
    expect(rendered.result().error).toBeUndefined()
    rendered.unmount()
  })

  test('a 422 on a broad filter splits by trips into parts under the limit', async () => {
    const saved: SavedFile[] = []
    const calls: Parameters<TripProofPdfFetch>[0][] = []
    const rendered = await renderHook(() =>
      useTripProofPdfExport({
        fetchPdf: (input) => {
          calls.push(input)
          return input.filters.tripIdIn === undefined
            ? Promise.reject(new TripProofPdfTooLargeError(200))
            : Promise.resolve(new Blob(['pdf']))
        },
        fetchRows: () =>
          Promise.resolve(buildTripRows({ 'trip-a': 120, 'trip-b': 100, 'trip-c': 50 })),
        savePdf: (file) => saved.push(file),
        scope: { filters: { search: 'x' } },
      }),
    )
    await act(() => rendered.result().exportPdf())
    expect(calls.slice(1).map((call) => call.filters.tripIdIn)).toEqual([
      ['trip-a'],
      ['trip-b', 'trip-c'],
    ])
    expect(calls[1]?.filters.search).toBe('x')
    expect(saved).toHaveLength(2)
    expect(saved[0]?.fileName).toMatch(/^trip-proofs-part-1-of-2-/)
    expect(rendered.result().error).toBeUndefined()
    rendered.unmount()
  })

  test('cancelling between parts keeps what was saved and says how many', async () => {
    const saved: SavedFile[] = []
    let release: () => void = () => undefined
    const rendered = await renderHook(() =>
      useTripProofPdfExport({
        fetchPdf: ({ signal }) =>
          new Promise<Blob>((resolve, reject) => {
            if (saved.length === 0) {
              resolve(new Blob(['pdf']))
              return
            }
            release = () => reject(new DOMException('aborted', 'AbortError'))
            signal?.addEventListener('abort', release)
          }),
        fetchRows: NO_ROWS,
        savePdf: (file) => saved.push(file),
        scope: { documentIds: buildIds(150) },
      }),
    )
    let pending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      pending = rendered.result().exportPdf()
      await Promise.resolve()
    })
    await waitFor(() => expect(saved).toHaveLength(1))
    await act(async () => {
      rendered.result().cancelExport()
      await pending
    })
    expect(rendered.result().error).toBeUndefined()
    expect(rendered.result().cancellation).toEqual({ saved: 1, total: 2 })
    rendered.unmount()
  })
})

describe('packTripProofPdfTrips (spec 253 T4.6)', () => {
  test('keeps each trip whole and fills parts in order', () => {
    expect(
      packTripProofPdfTrips({
        capacity: 200,
        rows: buildTripRows({ a: 120, b: 100, c: 50 }),
      }),
    ).toEqual([['a'], ['b', 'c']])
  })

  test('a single trip above the limit cannot be split', () => {
    expect(() =>
      packTripProofPdfTrips({ capacity: 200, rows: buildTripRows({ huge: 201 }) }),
    ).toThrow(TripProofPdfTooLargeError)
  })
})

describe('buildTripProofPdfSearch (spec 253 T4.6)', () => {
  test('uses the same query as the report', () => {
    const search = new URLSearchParams(
      buildTripProofPdfSearch({ documentIdIn: ['a', 'b'], search: 'x' }),
    )
    expect(search.get('documentIdIn')).toBe('a,b')
    expect(search.get('search')).toBe('x')
    expect(search.has('cursor')).toBe(false)
  })
})

describe('TripProofPdfExportButton (spec 253 T4.6)', () => {
  function findButton(): HTMLButtonElement {
    const button = document.body.querySelector<HTMLButtonElement>('button[aria-label]')
    if (button === null) throw new Error('BUTTON_NOT_RENDERED')
    return button
  }

  test('accessible label, icon, enabled when idle', async () => {
    const view = await renderWithQueryClient(
      createElement(TripProofPdfExportButton, { scope: { documentIds: buildIds(100) } }),
    )
    expect(findButton().getAttribute('aria-label')).toBe('Exportar canhotos (PDF)')
    expect(findButton().querySelector('svg')).not.toBeNull()
    expect(findButton().disabled).toBe(false)
    view.unmount()
  })

  test('over 100 notes keeps the button enabled: the PDF goes out in parts', async () => {
    const view = await renderWithQueryClient(
      createElement(TripProofPdfExportButton, { scope: { documentIds: buildIds(101) } }),
    )
    expect(findButton().disabled).toBe(false)
    view.unmount()
  })

  test('while exporting, shows the progress and a cancel button that aborts', async () => {
    const view = await renderWithQueryClient(
      createElement(TripProofPdfExportButton, {
        fetchPdf: ({ signal }) =>
          new Promise<Blob>((_resolve, reject) => {
            signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
        fetchRows: NO_ROWS,
        savePdf: () => undefined,
        scope: { documentIds: buildIds(150) },
      }),
    )
    await act(async () => {
      findButton().click()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(document.body.querySelector('[role="status"]')?.textContent).toContain('1 de 2'),
    )
    expect(document.body.querySelector('progress')).not.toBeNull()
    const cancel = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent === 'Cancelar',
    )
    expect(cancel).toBeDefined()
    await act(async () => {
      cancel?.click()
      await Promise.resolve()
    })
    await waitFor(() => expect(findButton().disabled).toBe(false))
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('cancelada')
    view.unmount()
  })

  test('exporting disables the button; 422 shows the limit in an alert', async () => {
    const view = await renderWithQueryClient(
      createElement(TripProofPdfExportButton, {
        fetchPdf: () => new Promise<Blob>(() => undefined),
        fetchRows: NO_ROWS,
        scope: { filters: {} },
      }),
    )
    await act(async () => {
      findButton().click()
      await Promise.resolve()
    })
    await waitFor(() => expect(findButton().disabled).toBe(true))
    expect(findButton().getAttribute('aria-label')).toBe(findButton().textContent)
    expect(findButton().getAttribute('aria-label')).toContain('Gerando')
    expect(findButton().getAttribute('aria-live')).toBe('polite')
    view.unmount()

    const failing = await renderWithQueryClient(
      createElement(TripProofPdfExportButton, {
        fetchPdf: () => Promise.reject(new TripProofPdfTooLargeError(200)),
        fetchRows: () => Promise.resolve(buildTripRows({ 'trip-huge': 300 })),
        scope: { filters: {} },
      }),
    )
    await act(async () => {
      findButton().click()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('200'),
    )
    failing.unmount()
  })
})

describe('buildTripExportFileName', () => {
  test('uses the local date and time, not UTC', () => {
    const lateEvening = new Date(2026, 9, 8, 23, 30)
    expect(
      buildTripExportFileName({ baseName: 'trip-report', extension: 'xlsx', today: lateEvening }),
    ).toBe('trip-report-2026-10-08-2330.xlsx')
  })

  test('pads month, day, hour and minute', () => {
    const firstDay = new Date(2026, 0, 5, 9, 5)
    expect(
      buildTripExportFileName({ baseName: 'trip-proofs', extension: 'pdf', today: firstDay }),
    ).toBe('trip-proofs-2026-01-05-0905.pdf')
  })
})
