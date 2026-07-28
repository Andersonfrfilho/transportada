/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createViewPreferencesClient } from '../../src/modules/nfe-workspace/shared/viewPreferencesClient.service'
import { SYNTHETIC_ACCESS_TOKEN } from './nfe-workspace.fixture'

const VIEW_KEY = 'nfe-workspace.documents'
const PREFERENCES = { columnOrder: ['status', 'number'], pageSize: 100 }
const RECORD = { preferences: PREFERENCES, updatedAt: '2026-07-24T10:00:00.000Z' }

describe('view preferences client contract', () => {
  test('reads with an authenticated no-store GET carrying the viewKey query', async () => {
    const requests: Request[] = []
    const client = createViewPreferencesClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(Response.json({ data: RECORD }))
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(await client.get({ viewKey: VIEW_KEY })).toEqual(RECORD)

    const [request] = requests
    if (request === undefined) throw new Error('VIEW_PREFERENCES_CONTRACT_REQUEST_MISSING')
    expect(request.url).toBe(
      `https://api.example.test/view-preferences?viewKey=${encodeURIComponent(VIEW_KEY)}`,
    )
    expect(request.method).toBe('GET')
    expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(request.cache).toBe('no-store')
  })

  test('returns null when the user has no stored view yet', async () => {
    const client = createViewPreferencesClient({
      apiUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(Response.json({ data: null })),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(await client.get({ viewKey: VIEW_KEY })).toBeNull()
  })

  test('saves with an authenticated JSON PUT carrying preferences and viewKey in the body', async () => {
    const requests: Request[] = []
    const client = createViewPreferencesClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(Response.json({ data: RECORD }))
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(await client.save({ preferences: PREFERENCES, viewKey: VIEW_KEY })).toEqual(RECORD)

    const [request] = requests
    if (request === undefined) throw new Error('VIEW_PREFERENCES_CONTRACT_REQUEST_MISSING')
    expect(request.url).toBe('https://api.example.test/view-preferences')
    expect(request.method).toBe('PUT')
    expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(request.headers.get('content-type')).toBe('application/json')
    expect(request.cache).toBe('no-store')
    expect(await request.json()).toEqual({ preferences: PREFERENCES, viewKey: VIEW_KEY })
  })

  test('rejects a malformed envelope', async () => {
    const client = createViewPreferencesClient({
      apiUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(Response.json({ unexpected: true })),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const error = await client.get({ viewKey: VIEW_KEY }).then(
      () => undefined,
      (reason: unknown) => reason,
    )
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('VIEW_PREFERENCES_RESPONSE_INVALID')
  })

  test('surfaces a stable error when the network call fails', async () => {
    const client = createViewPreferencesClient({
      apiUrl: 'https://api.example.test',
      fetch: () => Promise.reject(new Error('offline')),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const error = await client.get({ viewKey: VIEW_KEY }).then(
      () => undefined,
      (reason: unknown) => reason,
    )
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('VIEW_PREFERENCES_REQUEST_FAILED')
  })
})
