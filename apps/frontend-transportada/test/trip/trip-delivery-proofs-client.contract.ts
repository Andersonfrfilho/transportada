/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createTripClient } from '../../src/modules/trip/shared/tripClient.service'

import { DOCUMENT_ID, SYNTHETIC_ACCESS_TOKEN, TRIP_ID } from './trip.fixture'

const API_URL = 'https://api.example.test'
const PROOFS_URL = `${API_URL}/trips/${TRIP_ID}/delivery-proofs`

const PROOF_ITEM = {
  canhotoReadNumber: '1234',
  canhotoReadSource: 'barcode',
  canhotoReview: 'pending',
  createdAt: '2026-09-30T10:00:00Z',
  documentId: DOCUMENT_ID,
  downloadUrl: 'https://storage.test/original/receipt',
  expiresAt: '2026-09-30T10:05:00Z',
  id: 'proof-receipt',
  kind: 'photo',
  receiverName: '',
} as const

function createClient(requests: Request[], data: unknown): ReturnType<typeof createTripClient> {
  return createTripClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(Response.json({ data }))
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

describe('readTripDeliveryProofs (spec 222 T2.4)', () => {
  test('GETs the trip-wide route with no query, and keeps the documentId of each proof', async () => {
    const requests: Request[] = []
    const client = createClient(requests, [PROOF_ITEM])

    const proofs = await client.readTripDeliveryProofs({ tripId: TRIP_ID })

    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.url).toBe(PROOFS_URL)
    expect(proofs).toHaveLength(1)
    expect(proofs[0]?.documentId).toBe(DOCUMENT_ID)
    expect(proofs[0]?.canhotoReview).toBe('pending')
    expect(proofs[0]?.canhotoReadNumber).toBe('1234')
  })

  test('drops an item without documentId or with an unknown shape instead of failing the list', async () => {
    const withoutDocumentId: Record<string, unknown> = { ...PROOF_ITEM }
    delete withoutDocumentId.documentId
    const client = createClient(
      [],
      [PROOF_ITEM, withoutDocumentId, { ...PROOF_ITEM, id: 'proof-strange', unknownKey: 'x' }],
    )

    const proofs = await client.readTripDeliveryProofs({ tripId: TRIP_ID })

    expect(proofs.map((proof) => proof.id)).toEqual(['proof-receipt'])
  })

  test('refuses a body that is not a list', async () => {
    const client = createClient([], { documentId: DOCUMENT_ID })

    let failure: unknown
    try {
      await client.readTripDeliveryProofs({ tripId: TRIP_ID })
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(Error)
  })
})
