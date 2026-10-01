/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createTripClient } from '../../src/modules/trip/shared/tripClient.service'
import { createTripController } from '../../src/modules/trip/hooks/useTripWorkspace.hook'

import { DOCUMENT_ID, SYNTHETIC_ACCESS_TOKEN, TRIP_ID, TRIP_MANAGE } from './trip.fixture'

const API_URL = 'https://api.example.test'
const REVIEW_URL = `${API_URL}/trips/${TRIP_ID}/documents/${DOCUMENT_ID}/proof/review`
const TARGET = { documentId: DOCUMENT_ID, tripId: TRIP_ID } as const

/** A view da API usa `null` para ausente e traz `not_applicable`: não é o `DeliveryProof`. */
const REVIEW_VIEW = {
  canhotoReadNumber: null,
  canhotoReadSeries: null,
  canhotoReadSource: null,
  canhotoReview: 'approved',
  canhotoReviewAt: '2026-09-30T12:00:00Z',
  canhotoReviewNote: null,
  canhotoReviewOrigin: 'manual',
  canhotoReviewReason: null,
} as const

function createRecordingClient(requests: Request[]): ReturnType<typeof createTripClient> {
  return createTripClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(Response.json({ data: REVIEW_VIEW }))
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

describe('canhotoReviewProof (spec 220 T7.9)', () => {
  test('PATCHes approve and reject to the review route, without an idempotency key', async () => {
    const requests: Request[] = []
    const client = createRecordingClient(requests)

    const result = await client.canhotoReviewProof({ ...TARGET, review: { action: 'approve' } })
    await client.canhotoReviewProof({
      ...TARGET,
      review: { action: 'reject', note: 'Canhoto molhado', reason: 'other' },
    })

    const [approveRequest, rejectRequest] = requests
    expect(approveRequest?.method).toBe('PATCH')
    expect(approveRequest?.url).toBe(REVIEW_URL)
    expect(approveRequest?.headers.get('idempotency-key')).toBeNull()
    expect(await approveRequest?.json()).toEqual({ action: 'approve' })
    expect(rejectRequest?.url).toBe(REVIEW_URL)
    expect(await rejectRequest?.json()).toEqual({
      action: 'reject',
      note: 'Canhoto molhado',
      reason: 'other',
    })
    expect(result.canhotoReview).toBe('approved')
    expect(result.canhotoReviewAt).toBe('2026-09-30T12:00:00Z')
    expect(result.canhotoReadNumber).toBeUndefined()
  })

  test('accepts not_applicable and refuses a verdict outside the vocabulary', async () => {
    const respondWith = (canhotoReview: string): ReturnType<typeof createTripClient> =>
      createTripClient({
        apiUrl: API_URL,
        fetch: () => Promise.resolve(Response.json({ data: { ...REVIEW_VIEW, canhotoReview } })),
        getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
      })
    const review = { ...TARGET, review: { action: 'approve' } } as const

    const notApplicable = await respondWith('not_applicable').canhotoReviewProof(review)
    expect(notApplicable.canhotoReview).toBe('not_applicable')

    const refusal = await respondWith('reviewed')
      .canhotoReviewProof(review)
      .catch((e: unknown) => e)
    expect(refusal).toEqual(new Error('TRIP_RESPONSE_INVALID'))
  })

  test('the controller refuses without trip.manage and delegates with it', async () => {
    const requests: Request[] = []
    const client = createRecordingClient(requests)
    const review = { ...TARGET, review: { action: 'approve' } } as const

    const readOnly = createTripController({ client, permissions: ['trip.read'] })
    const manager = createTripController({ client, permissions: [TRIP_MANAGE] })

    const refusal = await readOnly.canhotoReviewProof(review).catch((error: unknown) => error)
    expect(refusal).toEqual(new Error('TRIP_FORBIDDEN'))
    expect(requests).toHaveLength(0)
    await manager.canhotoReviewProof(review)
    expect(requests).toHaveLength(1)
  })
})
