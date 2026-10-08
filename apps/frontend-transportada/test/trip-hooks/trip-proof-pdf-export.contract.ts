/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'

import '@/modules/shared/i18n/i18n.service'
import { TripProofPdfExportButton } from '@/modules/trip/components/TripProofPdfExportButton.component'
import { useTripProofPdfExport } from '@/modules/trip/hooks/useTripProofPdfExport.hook'
import {
  buildTripProofPdfSearch,
  TripProofPdfTooLargeError,
  type TripProofPdfFetch,
} from '@/modules/trip/shared/tripProofPdf.service'

import { renderHook, renderWithQueryClient, waitFor } from './renderHook.helper'

type SavedFile = Readonly<{ blob: Blob; fileName: string }>

function buildIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `document-${index}`)
}

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
    expect(saved[0]?.fileName).toBe('trip-proofs.pdf')
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

  test('more than 100 document ids is refused before any request', async () => {
    let requests = 0
    const rendered = await renderHook(() =>
      useTripProofPdfExport({
        fetchPdf: () => {
          requests += 1
          return Promise.resolve(new Blob())
        },
        savePdf: () => undefined,
        scope: { documentIds: buildIds(101) },
      }),
    )
    await act(() => rendered.result().exportPdf())
    expect(requests).toBe(0)
    await waitFor(() => expect(rendered.result().isTooManyDocuments).toBe(true))
    rendered.unmount()
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

  test('over 100 notes disables the button and warns', async () => {
    const view = await renderWithQueryClient(
      createElement(TripProofPdfExportButton, { scope: { documentIds: buildIds(101) } }),
    )
    expect(findButton().disabled).toBe(true)
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('até 100 notas')
    view.unmount()
  })

  test('exporting disables the button; 422 shows the limit in an alert', async () => {
    const view = await renderWithQueryClient(
      createElement(TripProofPdfExportButton, {
        fetchPdf: () => new Promise<Blob>(() => undefined),
        scope: { filters: {} },
      }),
    )
    await act(async () => {
      findButton().click()
      await Promise.resolve()
    })
    await waitFor(() => expect(findButton().disabled).toBe(true))
    view.unmount()

    const failing = await renderWithQueryClient(
      createElement(TripProofPdfExportButton, {
        fetchPdf: () => Promise.reject(new TripProofPdfTooLargeError(200)),
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
