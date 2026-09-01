/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  loadFutureModule,
  NFE_ACCESS_KEY,
  NFE_DOCUMENT_LISTING_ROW,
  SCANNED_NFE_DOCUMENT,
  SYNTHETIC_ACCESS_TOKEN,
} from './trip.fixture'

const API_URL = 'https://api.example.test'
const LOOKUP_URL = `${API_URL}/nfe-documents?limit=1&accessKey=${NFE_ACCESS_KEY}`

describe('trip document scan lookup contract', () => {
  test('reads the scanned note by access key over an authenticated no-store request', async () => {
    const requests: Request[] = []
    const client = await createClient({
      requests,
      respond: () =>
        Response.json({ data: [NFE_DOCUMENT_LISTING_ROW], page: { nextCursor: null } }),
    })

    expect(await client.findNfeDocumentByAccessKey({ accessKey: NFE_ACCESS_KEY })).toEqual(
      SCANNED_NFE_DOCUMENT,
    )

    const [lookupRequest] = requests
    if (lookupRequest === undefined) throw new Error('TRIP_CONTRACT_REQUEST_MISSING')
    expect(lookupRequest.url).toBe(LOOKUP_URL)
    expect(lookupRequest.method).toBe('GET')
    expect(lookupRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(lookupRequest.cache).toBe('no-store')
  })

  test('keeps the note the empresa really has, ignoring the columns the listing may gain', async () => {
    const client = await createClient({
      respond: () =>
        Response.json({
          data: [{ ...NFE_DOCUMENT_LISTING_ROW, columnAddedLater: 'ignored' }],
          page: { nextCursor: null },
        }),
    })

    expect(await client.findNfeDocumentByAccessKey({ accessKey: NFE_ACCESS_KEY })).toEqual(
      SCANNED_NFE_DOCUMENT,
    )
  })

  test('answers absence when no note of this empresa carries the key', async () => {
    const client = await createClient({
      respond: () => Response.json({ data: [], page: { nextCursor: null } }),
    })

    expect(await client.findNfeDocumentByAccessKey({ accessKey: NFE_ACCESS_KEY })).toBeNull()
  })

  test('refuses a payload outside the format with the responseInvalid the module already has', async () => {
    const client = await createClient({
      respond: () =>
        Response.json({
          data: [{ ...NFE_DOCUMENT_LISTING_ROW, number: 123456 }],
          page: { nextCursor: null },
        }),
    })

    expect(client.findNfeDocumentByAccessKey({ accessKey: NFE_ACCESS_KEY })).rejects.toThrow(
      'TRIP_RESPONSE_INVALID',
    )
  })

  test('refuses an envelope without the listing page with the same responseInvalid', async () => {
    const client = await createClient({ respond: () => Response.json({ data: 'not-a-list' }) })

    expect(client.findNfeDocumentByAccessKey({ accessKey: NFE_ACCESS_KEY })).rejects.toThrow(
      'TRIP_RESPONSE_INVALID',
    )
  })

  test('surfaces the API error code when the listing refuses the key', async () => {
    const client = await createClient({
      respond: () =>
        Response.json({ error: { code: 'NFE_DOCUMENT_ACCESS_KEY_INVALID' } }, { status: 400 }),
    })

    expect(client.findNfeDocumentByAccessKey({ accessKey: NFE_ACCESS_KEY })).rejects.toThrow(
      'NFE_DOCUMENT_ACCESS_KEY_INVALID',
    )
  })

  /**
   * Leitura nova cancela a anterior, e cancelamento não é falha de rede: virasse
   * `TRIP_REQUEST_FAILED`, cada bipe rápido acenderia "não foi possível falar com a API".
   */
  test('rethrows the cancellation instead of turning it into a request failure', async () => {
    const controller = new AbortController()
    const requests: Request[] = []
    const client = await createClient({
      requests,
      respond: (request) => {
        if (request.signal.aborted) throw request.signal.reason
        return Response.json({ data: [NFE_DOCUMENT_LISTING_ROW], page: { nextCursor: null } })
      },
    })

    controller.abort(new Error('TRIP_SCAN_SUPERSEDED'))
    expect(
      client.findNfeDocumentByAccessKey({ accessKey: NFE_ACCESS_KEY, signal: controller.signal }),
    ).rejects.toThrow('TRIP_SCAN_SUPERSEDED')

    const [lookupRequest] = requests
    if (lookupRequest === undefined) throw new Error('TRIP_CONTRACT_REQUEST_MISSING')
    expect(lookupRequest.signal.aborted).toBe(true)
  })

  test('still reports a network failure that is not a cancellation', async () => {
    const client = await createClient({
      respond: () => {
        throw new Error('offline')
      },
    })

    expect(client.findNfeDocumentByAccessKey({ accessKey: NFE_ACCESS_KEY })).rejects.toThrow(
      'TRIP_REQUEST_FAILED',
    )
  })
})

type ScanLookupInput = Readonly<{ accessKey: string; signal?: AbortSignal }>

type ScanLookupClient = {
  findNfeDocumentByAccessKey(input: ScanLookupInput): Promise<unknown>
}

type TripClientModule = {
  readonly createTripClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => ScanLookupClient
}

async function createClient(
  input: Readonly<{ requests?: Request[]; respond: (request: Request) => Response }>,
): Promise<ScanLookupClient> {
  const { createTripClient } = await loadFutureModule<TripClientModule>(
    '../../src/modules/trip/shared/tripClient.service',
  )
  return createTripClient({
    apiUrl: API_URL,
    fetch: (target, init) => {
      const request = new Request(target, init)
      input.requests?.push(request)
      return Promise.resolve(input.respond(request))
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}
