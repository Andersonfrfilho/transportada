/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  createPendingItemsClient,
  removePendingItemFromPages,
} from '../../src/modules/pending-items/shared/pendingItemsClient.service'

const SUGGESTION_ID = '00000000-0000-4000-8000-000000000941'
const API_ITEM = {
  details: {
    addressKey: '3543402|14300000|100',
    currentLatitude: '-23.5500000',
    currentLongitude: '-46.6300000',
    distanceMeters: 1400,
    latitude: '-23.5600000',
    longitude: '-46.6400000',
    tripStopId: '00000000-0000-4000-8000-000000000942',
  },
  entityId: SUGGESTION_ID,
  entityType: 'addressSuggestion',
  kind: 'addressSuggestedByDriver',
  label: 'Centro, 100',
} as const

function clientWith(respond: (request: Request) => Response, requests: Request[] = []) {
  return createPendingItemsClient({
    apiUrl: 'https://api.example.test',
    fetch: (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      return Promise.resolve(respond(request))
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

describe('pending items address suggestion contract', () => {
  test('reads the suggested and the current point as numbers', async () => {
    const client = clientWith(() => Response.json({ data: [API_ITEM], page: { nextCursor: null } }))

    const page = await client.listPendingItems({})

    expect(page.items[0]).toEqual({
      details: {
        addressKey: '3543402|14300000|100',
        current: { latitude: -23.55, longitude: -46.63 },
        distanceMeters: 1400,
        suggested: { latitude: -23.56, longitude: -46.64 },
        tripStopId: '00000000-0000-4000-8000-000000000942',
      },
      entityId: SUGGESTION_ID,
      entityType: 'addressSuggestion',
      kind: 'addressSuggestedByDriver',
      label: 'Centro, 100',
    })
  })

  test('an address without a stored point has no current point', async () => {
    const withoutCurrent = {
      ...API_ITEM,
      details: {
        ...API_ITEM.details,
        currentLatitude: null,
        currentLongitude: null,
        distanceMeters: null,
      },
    }
    const client = clientWith(() =>
      Response.json({ data: [withoutCurrent], page: { nextCursor: null } }),
    )

    const page = await client.listPendingItems({})
    const item = page.items[0]

    expect(item?.kind === 'addressSuggestedByDriver' ? item.details.current : 'wrong').toBeNull()
  })

  test('rejects a suggestion with a non-numeric coordinate', async () => {
    const broken = { ...API_ITEM, details: { ...API_ITEM.details, latitude: 'abc' } }
    const client = clientWith(() => Response.json({ data: [broken], page: { nextCursor: null } }))

    const error = await client.listPendingItems({}).catch((caught: unknown) => caught)

    expect((error as Error).message).toBe('PENDING_ITEMS_INVALID_RESPONSE')
  })

  test('apply and dismiss POST to the suggestion decision path with the bearer token', async () => {
    const requests: Request[] = []
    const client = clientWith(
      () => Response.json({ data: { id: SUGGESTION_ID, status: 'applied' } }),
      requests,
    )

    await client.decideAddressSuggestion({ decision: 'apply', suggestionId: SUGGESTION_ID })
    await client.decideAddressSuggestion({ decision: 'dismiss', suggestionId: SUGGESTION_ID })

    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ['POST', `https://api.example.test/address-correction-suggestions/${SUGGESTION_ID}/apply`],
      ['POST', `https://api.example.test/address-correction-suggestions/${SUGGESTION_ID}/dismiss`],
    ])
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer synthetic-token')
  })

  test('a failed decision rejects so the screen can roll back', async () => {
    const client = clientWith(() => new Response('{}', { status: 409 }))

    const error = await client
      .decideAddressSuggestion({ decision: 'apply', suggestionId: SUGGESTION_ID })
      .catch((caught: unknown) => caught)

    expect((error as Error).message).toBe('PENDING_ITEMS_REQUEST_FAILED')
  })

  test('the optimistic removal drops the decided suggestion from every loaded page', async () => {
    const other = { ...API_ITEM, entityId: '00000000-0000-4000-8000-000000000999' }
    const client = clientWith(() =>
      Response.json({ data: [API_ITEM, other], page: { nextCursor: null } }),
    )
    const page = await client.listPendingItems({})

    const remaining = removePendingItemFromPages({ entityId: SUGGESTION_ID, pages: [page, page] })

    expect(remaining.map((entry) => entry.items.map((item) => item.entityId))).toEqual([
      [other.entityId],
      [other.entityId],
    ])
  })
})
