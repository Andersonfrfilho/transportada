/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createPendingItemsClient } from '../../src/modules/pending-items/shared/pendingItemsClient.service'
import { createPendingItemPageAdapter } from '../../src/modules/pending-items/shared/pendingItemsResponse.validation'

const ACCESS_TOKEN = 'pending-items-synthetic-token'
const VEHICLE_ID = '00000000-0000-4000-8000-000000000931'
const PAGE = {
  items: [
    {
      entityId: VEHICLE_ID,
      entityType: 'vehicle',
      kind: 'vehicleBodyTypeMissing',
      label: 'ABC1D23',
    },
  ],
  nextCursor: null,
} as const

describe('pending items client contract', () => {
  test('uses an authenticated no-store GET with cursor and limit in the query string', async () => {
    const requests: Request[] = []
    const client = createPendingItemsClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(
          Response.json({ data: PAGE.items, page: { nextCursor: PAGE.nextCursor } }),
        )
      },
      getAccessToken: () => Promise.resolve(ACCESS_TOKEN),
    })

    const page = await client.listPendingItems({ cursor: 'some-cursor', limit: 25 })

    expect(page).toEqual(PAGE)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.cache).toBe('no-store')
    expect(requests[0]?.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(requests[0]?.url).toBe(
      'https://api.example.test/pending-items?cursor=some-cursor&limit=25',
    )
  })

  test('omits cursor and limit from the query string when absent', async () => {
    const requests: Request[] = []
    const client = createPendingItemsClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(Response.json({ data: [], page: { nextCursor: null } }))
      },
      getAccessToken: () => Promise.resolve(ACCESS_TOKEN),
    })

    await client.listPendingItems({})

    expect(requests[0]?.url).toBe('https://api.example.test/pending-items?')
  })

  test('rejects a failed request and an unparsable body', () => {
    const failing = createPendingItemsClient({
      apiUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(new Response('nope', { status: 500 })),
      getAccessToken: () => Promise.resolve(ACCESS_TOKEN),
    })
    expect(failing.listPendingItems({})).rejects.toThrow('PENDING_ITEMS_REQUEST_FAILED')

    const malformed = createPendingItemsClient({
      apiUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(new Response('not json', { status: 200 })),
      getAccessToken: () => Promise.resolve(ACCESS_TOKEN),
    })
    expect(malformed.listPendingItems({})).rejects.toThrow('PENDING_ITEMS_RESPONSE_INVALID')
  })
})

describe('pending items response validation contract', () => {
  test('accepts a well-formed page', () => {
    const adapter = createPendingItemPageAdapter()

    expect(
      adapter.pageFromApi({ data: PAGE.items, page: { nextCursor: PAGE.nextCursor } }),
    ).toEqual(PAGE)
  })

  test('rejects an item with an extra or unknown field', () => {
    const adapter = createPendingItemPageAdapter()

    expect(() =>
      adapter.pageFromApi({
        data: [{ ...PAGE.items[0], companyId: 'forbidden-company' }],
        page: { nextCursor: null },
      }),
    ).toThrow('PENDING_ITEMS_INVALID_RESPONSE')
  })

  test('rejects an unknown kind and a missing page envelope', () => {
    const adapter = createPendingItemPageAdapter()

    expect(() =>
      adapter.pageFromApi({
        data: [{ ...PAGE.items[0], kind: 'somethingElse' }],
        page: { nextCursor: null },
      }),
    ).toThrow('PENDING_ITEMS_INVALID_RESPONSE')
    expect(() => adapter.pageFromApi({ data: PAGE.items })).toThrow(
      'PENDING_ITEMS_INVALID_RESPONSE',
    )
  })
})
