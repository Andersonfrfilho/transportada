/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.3 (RF-A6, RF-A7): confirmar o maço chama a conferência que já existe, uma vez por nota,
 * e a falha de uma não derruba o lote. O 409 de canhoto já resolvido não é falha — é "outra pessoa
 * chegou antes", e a tela o mostra como tal (CA07); a falha de rede deixa só aquela nota para a
 * próxima tentativa, e a tela diz "1 de 5" (CA08).
 */
import { describe, expect, test } from 'bun:test'

import { approveCanhotoBatch } from '@/modules/trip/shared/canhotoBatchApproval.service'
import { CANHOTO_BATCH_CONCURRENCY } from '@/modules/trip/shared/canhotoBatch.constant'
import type {
  CanhotoReviewProofInput,
  CanhotoReviewResult,
} from '@/modules/trip/shared/canhotoReviewResult.service'
import { CANHOTO_REVIEW_ALREADY_RESOLVED_CODE } from '@/modules/trip/shared/trip.constant'

const TRIP_ID = 'trip-1'
const FIVE_DOCUMENTS = ['d1', 'd2', 'd3', 'd4', 'd5'] as const
const APPROVED: CanhotoReviewResult = { canhotoReview: 'approved', canhotoReviewOrigin: 'manual' }

function createRecordingReview(failures: Readonly<Record<string, unknown>> = {}): Readonly<{
  calls: CanhotoReviewProofInput[]
  review: (input: CanhotoReviewProofInput) => Promise<CanhotoReviewResult>
}> {
  const calls: CanhotoReviewProofInput[] = []
  return {
    calls,
    review: (input) => {
      calls.push(input)
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- um caso rejeita um valor que não é Error
      if (input.documentId in failures) return Promise.reject(failures[input.documentId])
      return Promise.resolve(APPROVED)
    },
  }
}

describe('approveCanhotoBatch (spec 222 T2.3)', () => {
  test('approves every note once, with the existing approve action and nothing else (RF-A6)', async () => {
    const { calls, review } = createRecordingReview()

    const result = await approveCanhotoBatch({
      documentIds: FIVE_DOCUMENTS,
      review,
      tripId: TRIP_ID,
    })

    expect(result).toEqual({ approved: [...FIVE_DOCUMENTS], conflicted: [], failed: [] })
    expect(calls.map((call) => call.documentId).toSorted()).toEqual([...FIVE_DOCUMENTS])
    expect(calls.every((call) => call.tripId === TRIP_ID)).toBe(true)
    expect(calls.every((call) => call.review.action === 'approve')).toBe(true)
  })

  test('a 409 is a conflict, not a failure: four approved, the third leaves the list (CA07)', async () => {
    const { review } = createRecordingReview({
      d3: new Error(CANHOTO_REVIEW_ALREADY_RESOLVED_CODE),
    })

    const result = await approveCanhotoBatch({
      documentIds: FIVE_DOCUMENTS,
      review,
      tripId: TRIP_ID,
    })

    expect(result.approved).toEqual(['d1', 'd2', 'd4', 'd5'])
    expect(result.conflicted).toEqual(['d3'])
    expect(result.failed).toEqual([])
  })

  test('a network failure keeps only that note for another try, and the others still run (CA08)', async () => {
    const { calls, review } = createRecordingReview({ d2: new TypeError('Failed to fetch') })

    const result = await approveCanhotoBatch({
      documentIds: FIVE_DOCUMENTS,
      review,
      tripId: TRIP_ID,
    })

    expect(result.approved).toEqual(['d1', 'd3', 'd4', 'd5'])
    expect(result.conflicted).toEqual([])
    expect(result.failed).toEqual([{ documentId: 'd2', errorCode: 'Failed to fetch' }])
    expect(calls).toHaveLength(FIVE_DOCUMENTS.length)
  })

  test('a conflict and a failure in the same batch are reported apart', async () => {
    const { review } = createRecordingReview({
      d1: new Error(CANHOTO_REVIEW_ALREADY_RESOLVED_CODE),
      d5: new Error('TRIP_FORBIDDEN'),
    })

    const result = await approveCanhotoBatch({
      documentIds: FIVE_DOCUMENTS,
      review,
      tripId: TRIP_ID,
    })

    expect(result.approved).toEqual(['d2', 'd3', 'd4'])
    expect(result.conflicted).toEqual(['d1'])
    expect(result.failed).toEqual([{ documentId: 'd5', errorCode: 'TRIP_FORBIDDEN' }])
  })

  test('a rejection that is not an Error becomes UNKNOWN instead of breaking the batch', async () => {
    const { review } = createRecordingReview({ d1: 'não é um Error' })

    const result = await approveCanhotoBatch({ documentIds: ['d1', 'd2'], review, tripId: TRIP_ID })

    expect(result.approved).toEqual(['d2'])
    expect(result.failed).toEqual([{ documentId: 'd1', errorCode: 'UNKNOWN' }])
  })

  test('never has more reviews in flight than the batch concurrency', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const ids = Array.from({ length: 10 }, (_, index) => `n${index}`)

    await approveCanhotoBatch({
      documentIds: ids,
      review: async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return APPROVED
      },
      tripId: TRIP_ID,
    })

    expect(maxInFlight).toBeLessThanOrEqual(CANHOTO_BATCH_CONCURRENCY)
    expect(maxInFlight).toBeGreaterThan(1)
  })

  test('an empty batch calls nothing', async () => {
    const { calls, review } = createRecordingReview()

    const result = await approveCanhotoBatch({ documentIds: [], review, tripId: TRIP_ID })

    expect(result).toEqual({ approved: [], conflicted: [], failed: [] })
    expect(calls).toEqual([])
  })
})
