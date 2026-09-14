/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { createTripReviewAdapters } from '@/modules/trip/shared/tripReview.validation'
import {
  formatDeltaPercent,
  isDocumentLeftOut,
  runReviewChange,
  summarizeUnplacedNotes,
  type ReviewChangeClient,
} from '@/modules/trip/shared/tripReviewQueue.service'
import type { TripCargoLayoutPoll } from '@/modules/trip/shared/trip.types'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const REVIEW_REASONS = ['bedFull', 'largerThanBed', 'tooMany', 'swapped_out'] as const

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

function unplaced(documentId: string | null, reason: string, count = 1) {
  return { count, documentId, label: 'Caixa', reason }
}

function poll(status: 'pending' | 'ready', left: readonly string[]): TripCargoLayoutPoll {
  return {
    cargoLayout:
      status === 'pending'
        ? null
        : ({
            placement: {
              layers: [],
              source: 'measured',
              unplaced: left.map((documentId) => unplaced(documentId, 'bedFull')),
            },
          } as unknown as TripCargoLayoutPoll['cargoLayout']),
    layoutId: 'layout-1',
    state: { computedAt: null, errorCode: null, stale: false, status, truncated: false },
  }
}

function fakeClient(polls: readonly TripCargoLayoutPoll[], layoutId: null | string = 'layout-1') {
  const calls: { move: unknown[]; preview: unknown[]; swap: unknown[] } = {
    move: [],
    preview: [],
    swap: [],
  }
  let index = 0
  const client: ReviewChangeClient = {
    moveReview(input) {
      calls.move.push(input)
      return Promise.resolve()
    },
    previewReviewChange(input) {
      calls.preview.push(input)
      return Promise.resolve({ layoutId })
    },
    readCargoLayout() {
      const next = polls[Math.min(index, polls.length - 1)]
      index += 1
      return next === undefined ? Promise.reject(new Error('no poll')) : Promise.resolve(next)
    },
    swapReview(input) {
      calls.swap.push(input)
      return Promise.resolve()
    },
  }
  return { calls, client }
}

const NO_WAIT = (): Promise<void> => Promise.resolve()

function failureOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => '',
    (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
  )
}

/**
 * Spec 148 T7 (D7, D10–D13): a fila das notas que não couberam, na tela da viagem e da proposta.
 * Nenhum contrato renderiza: a regra se prova nas funções, e o componente pelo texto.
 */
describe('trip review queue contract (spec 148 T7)', () => {
  describe('summarizeUnplacedNotes', () => {
    it('groups the boxes by note with the reason that left most boxes out', () => {
      const summary = summarizeUnplacedNotes([
        unplaced('doc-a', 'bedFull', 3),
        unplaced('doc-a', 'largerThanBed', 1),
        unplaced('doc-b', 'tooMany', 2),
        unplaced(null, 'bedFull', 9),
      ])

      expect(summary.releasable).toEqual([
        { boxCount: 4, documentId: 'doc-a', reason: 'bedFull' },
        { boxCount: 2, documentId: 'doc-b', reason: 'tooMany' },
      ])
    })

    /** D11 e o corte por prazo: a nota fica no caminhão, com o aviso. */
    it('keeps the note cut by the time budget or without measure', () => {
      const summary = summarizeUnplacedNotes([
        unplaced('doc-a', 'time_budget'),
        unplaced('doc-b', 'notMeasured'),
        unplaced('doc-b', 'bedFull'),
      ])

      expect(summary.releasable).toEqual([])
      expect(summary.kept).toEqual([
        { documentId: 'doc-a', reason: 'time_budget' },
        { documentId: 'doc-b', reason: 'notMeasured' },
      ])
    })
  })

  it('prints the Δ% with sign and comma, and absence as absence', () => {
    expect(formatDeltaPercent(2.5)).toBe('+2,5%')
    expect(formatDeltaPercent(-5)).toBe('-5%')
    expect(formatDeltaPercent(0)).toBe('0%')
    expect(formatDeltaPercent(null)).toBeNull()
  })

  it('knows when the validated layout left the note out', () => {
    expect(isDocumentLeftOut(poll('ready', ['doc-a']).cargoLayout, 'doc-a')).toBe(true)
    expect(isDocumentLeftOut(poll('ready', []).cargoLayout, 'doc-a')).toBe(false)
  })

  describe('runReviewChange', () => {
    it('previews, waits for the layout and moves with the validated layout', async () => {
      const { calls, client } = fakeClient([poll('pending', []), poll('ready', [])])

      await runReviewChange({
        change: { kind: 'move', targetTripId: 'trip-2' },
        client,
        nfeDocumentId: 'doc-a',
        reviewId: 'review-1',
        wait: NO_WAIT,
      })

      expect(calls.preview).toEqual([{ reviewId: 'review-1', targetTripId: 'trip-2' }])
      expect(calls.move).toEqual([
        { reviewId: 'review-1', targetTripId: 'trip-2', validatedLayoutId: 'layout-1' },
      ])
    })

    it('swaps through the same path, previewing with the note that leaves', async () => {
      const { calls, client } = fakeClient([poll('ready', [])])

      await runReviewChange({
        change: { kind: 'swap', outTripDocumentId: 'link-9' },
        client,
        nfeDocumentId: 'doc-a',
        reviewId: 'review-1',
        wait: NO_WAIT,
      })

      expect(calls.preview).toEqual([{ outTripDocumentId: 'link-9', reviewId: 'review-1' }])
      expect(calls.swap).toEqual([
        { outTripDocumentId: 'link-9', reviewId: 'review-1', validatedLayoutId: 'layout-1' },
      ])
    })

    it('refuses when the note does not fit, without writing', async () => {
      const { calls, client } = fakeClient([poll('ready', ['doc-a'])])

      const failure = await failureOf(
        runReviewChange({
          change: { kind: 'move', targetTripId: 'trip-2' },
          client,
          nfeDocumentId: 'doc-a',
          reviewId: 'review-1',
          wait: NO_WAIT,
        }),
      )
      expect(failure).toBe('TRIP_DOCUMENT_REVIEW_DOES_NOT_FIT')
      expect(calls.move).toEqual([])
    })

    it('refuses a target without a measured bed: no layout, nothing to validate', async () => {
      const { calls, client } = fakeClient([], null)

      const failure = await failureOf(
        runReviewChange({
          change: { kind: 'move', targetTripId: 'trip-2' },
          client,
          nfeDocumentId: 'doc-a',
          reviewId: 'review-1',
          wait: NO_WAIT,
        }),
      )
      expect(failure).toBe('TRIP_REVIEW_TARGET_WITHOUT_LAYOUT')
      expect(calls.move).toEqual([])
    })
  })

  describe('adapters', () => {
    const review = {
      createdAt: '2026-09-14T10:00:00.000Z',
      id: 'review-1',
      nfeDocumentId: 'doc-a',
      nfeNumber: '123',
      reason: 'bedFull',
      resolutionTripId: null,
      resolvedAt: null,
      sourceTripId: 'trip-1',
      status: 'pending',
      swappedReviewId: null,
    }

    it('reads the queue, the release and the suggestions, and refuses an extra key', () => {
      const adapters = createTripReviewAdapters()

      expect<unknown>(adapters.reviewsFromApi([review])).toEqual([review])
      expect(() => adapters.reviewsFromApi([{ ...review, companyId: 'x' }])).toThrow()
      expect(adapters.releaseFromApi({ kept: [], reviews: [review] }).reviews).toHaveLength(1)
      expect(
        adapters.swapSuggestionsFromApi({
          incoming: { volumeM3: 1, weightKilograms: null },
          reviewId: 'review-1',
          suggestions: [
            {
              nfeDocumentId: 'doc-b',
              nfeNumber: null,
              tripDocumentId: 'link-2',
              volumeDeltaPercent: -5,
              volumeM3: 2,
              weightDeltaPercent: null,
              weightKilograms: null,
            },
          ],
        }).suggestions[0]?.volumeDeltaPercent,
      ).toBe(-5)
      expect(adapters.previewFromApi({ layoutId: null })).toEqual({ layoutId: null })
    })
  })

  it('shows the queue only to trip.manage on a trip still open, in the trip and the proposal', () => {
    const queue = readApplicationFile('src/modules/trip/components/TripReviewQueue.component.tsx')
    const entry = readApplicationFile('src/modules/trip/components/TripReviewEntry.component.tsx')
    const panel = readApplicationFile('src/modules/trip/components/TripCargoPanel.component.tsx')
    const detail = readApplicationFile('src/modules/trip/components/TripDetail.component.tsx')
    const proposal = readApplicationFile(
      'src/modules/trip/components/TripProposalDetail.component.tsx',
    )

    expect(queue).toContain("t('reviewQueue.title'")
    expect(queue).toContain("t('reviewQueue.release'")
    expect(queue).toContain('canManage && isEditable')
    expect(entry).toContain("t('reviewQueue.swap')")
    expect(entry).toContain("t('reviewQueue.move')")
    expect(entry).toContain("t('reviewQueue.delta'")
    expect(entry).toContain('useRevealedPanel')
    expect(entry).not.toContain('<select')
    expect(panel).toContain('reviewQueue')
    expect(detail).toContain('<TripReviewQueue')
    expect(proposal).toContain('<TripReviewQueue')
  })

  it('sends the release, the queue routes and the accept that releases', () => {
    const client = readApplicationFile('src/modules/trip/shared/tripClient.service.ts')
    const assembly = readApplicationFile('src/modules/trip/hooks/useTripRouteAssembly.hook.ts')

    expect(client).toContain('/release-unplaced')
    expect(client).toContain('TRIP_DOCUMENT_REVIEWS_PATH')
    expect(client).toContain('releaseUnplacedFromLayoutIds')
    expect(assembly).toContain('releaseUnplacedFromLayoutIds')
  })

  it('carries every text in both locales, accented in Portuguese', () => {
    for (const locale of [trip, tripEn]) {
      const texts = (locale as unknown as { reviewQueue: Record<string, unknown> }).reviewQueue
      const reasons = texts.reason as Record<string, string>
      expect(String(texts.title)).toContain('{{count}}')
      expect(String(texts.release)).toContain('{{count}}')
      expect(String(texts.delta)).toContain('{{weight}}')
      expect(String(texts.delta)).toContain('{{space}}')
      for (const reason of REVIEW_REASONS) expect(reasons[reason]).toBeTruthy()
      expect(texts.swap).toBeTruthy()
      expect(texts.move).toBeTruthy()
    }
    const pt = (trip as unknown as { reviewQueue: Record<string, string> }).reviewQueue
    expect(pt.title).toContain('Notas fora do caminhão')
    expect(pt.release).toContain('Tirar do caminhão')
    expect(pt.swap).toBe('Trocar por outra nota')
    expect(pt.move).toBe('Mover para outro caminhão')
  })
})
