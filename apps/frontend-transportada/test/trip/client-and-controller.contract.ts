/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CREATE_TRIP_BODY,
  DOCUMENT_ID,
  FLEET_MANAGE,
  FLEET_READ,
  loadFutureModule,
  NFE_DOCUMENT_ID,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  TRIP,
  TRIP_DETAIL,
  TRIP_DOCUMENT,
  TRIP_ID,
  TRIP_PAGE,
} from './trip.fixture'

const API_URL = 'https://api.example.test'
const TRIPS_PATH = `${API_URL}/trips`

describe('trip client contract', () => {
  test('lists, creates, closes and manages trip documents over authenticated no-store requests', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    expect(
      await client.listTrips({
        cursor: SYNTHETIC_CURSOR,
        filters: { statusEq: 'open', vehicleIdEq: TRIP.vehicleId },
        limit: 25,
      }),
    ).toEqual(TRIP_PAGE)
    expect(await client.createTrip(CREATE_TRIP_BODY)).toEqual(TRIP_DETAIL)
    expect(await client.getTrip({ tripId: TRIP_ID })).toEqual(TRIP_DETAIL)
    expect(
      await client.linkTripDocument({ freightCalculationId: null, nfeDocumentId: NFE_DOCUMENT_ID, tripId: TRIP_ID }),
    ).toEqual(TRIP_DOCUMENT)
    expect(await client.deliverTripDocument({ documentId: DOCUMENT_ID, tripId: TRIP_ID })).toEqual(
      TRIP_DOCUMENT,
    )
    expect(await client.releaseTripDocument({ documentId: DOCUMENT_ID, tripId: TRIP_ID })).toEqual(
      TRIP_DOCUMENT,
    )
    expect(await client.closeTrip({ tripId: TRIP_ID })).toEqual(TRIP_DETAIL)

    const [
      listRequest,
      createRequest,
      getRequest,
      linkRequest,
      deliverRequest,
      releaseRequest,
      closeRequest,
    ] = requests
    if (
      listRequest === undefined ||
      createRequest === undefined ||
      getRequest === undefined ||
      linkRequest === undefined ||
      deliverRequest === undefined ||
      releaseRequest === undefined ||
      closeRequest === undefined
    ) {
      throw new Error('TRIP_CONTRACT_REQUEST_MISSING')
    }

    expect(listRequest.url).toBe(
      `${TRIPS_PATH}?cursor=${encodeURIComponent(SYNTHETIC_CURSOR)}&limit=25&statusEq=open&vehicleIdEq=${TRIP.vehicleId}`,
    )
    expect(listRequest.method).toBe('GET')
    expect(listRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(listRequest.cache).toBe('no-store')

    expect(createRequest.url).toBe(TRIPS_PATH)
    expect(createRequest.method).toBe('POST')
    expect(createRequest.headers.get('content-type')).toBe('application/json')
    expect(await createRequest.json()).toEqual(CREATE_TRIP_BODY)

    expect(getRequest.url).toBe(`${TRIPS_PATH}/${TRIP_ID}`)
    expect(getRequest.method).toBe('GET')

    expect(linkRequest.url).toBe(`${TRIPS_PATH}/${TRIP_ID}/documents`)
    expect(linkRequest.method).toBe('POST')
    expect(await linkRequest.json()).toEqual({
      freightCalculationId: null,
      nfeDocumentId: NFE_DOCUMENT_ID,
    })

    expect(deliverRequest.url).toBe(`${TRIPS_PATH}/${TRIP_ID}/documents/${DOCUMENT_ID}/deliver`)
    expect(deliverRequest.method).toBe('POST')

    expect(releaseRequest.url).toBe(`${TRIPS_PATH}/${TRIP_ID}/documents/${DOCUMENT_ID}`)
    expect(releaseRequest.method).toBe('DELETE')

    expect(closeRequest.url).toBe(`${TRIPS_PATH}/${TRIP_ID}/close`)
    expect(closeRequest.method).toBe('POST')
  })

  test('surfaces the api error code instead of a generic failure', async () => {
    const { createTripClient } = await loadFutureModule<TripClientModule>(
      '../../src/modules/trip/shared/tripClient.service',
    )
    const client = createTripClient({
      apiUrl: API_URL,
      fetch: () =>
        Promise.resolve(
          Response.json({ error: { code: 'TRIP_VEHICLE_NOT_AVAILABLE', message: 'busy' } }, { status: 409 }),
        ),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(await client.createTrip(CREATE_TRIP_BODY).catch((caught: unknown) => caught)).toEqual(
      expect.objectContaining({ message: 'TRIP_VEHICLE_NOT_AVAILABLE' }),
    )
  })

  test('keeps the trip dto strict and rejects malformed payloads', async () => {
    const { createTripResponseAdapters } = await loadFutureModule<TripAdaptersModule>(
      '../../src/modules/trip/shared/tripResponse.validation',
    )
    const adapters = createTripResponseAdapters()

    expect(adapters.tripDetailFromApi(TRIP_DETAIL)).toEqual(TRIP_DETAIL)
    expect(adapters.tripDocumentFromApi(TRIP_DOCUMENT)).toEqual(TRIP_DOCUMENT)
    expect(adapters.tripListFromApi({ data: TRIP_PAGE.items, page: { nextCursor: TRIP_PAGE.nextCursor } })).toEqual(
      TRIP_PAGE,
    )

    expect(() => adapters.tripDetailFromApi({ ...TRIP_DETAIL, status: 'suspended' })).toThrow(
      'TRIP_RESPONSE_INVALID',
    )
    expect(() => adapters.tripDetailFromApi({ ...TRIP_DETAIL, extraField: 'nope' })).toThrow(
      'TRIP_RESPONSE_INVALID',
    )
    expect(() => adapters.tripDocumentFromApi({ ...TRIP_DOCUMENT, deliveredAt: 42 })).toThrow(
      'TRIP_RESPONSE_INVALID',
    )
    expect(() => adapters.tripListFromApi({ data: [TRIP], page: null })).toThrow(
      'TRIP_RESPONSE_INVALID',
    )
    expect(() =>
      adapters.tripDetailFromApi({
        ...TRIP_DETAIL,
        documents: [{ ...TRIP_DETAIL.documents[0], cteAuthorized: 'yes' }],
      }),
    ).toThrow('TRIP_RESPONSE_INVALID')
  })
})

describe('trip controller contract', () => {
  test('exposes trip mutations only to fleet.manage and reads only to fleet.read', async () => {
    const { createTripController } = await loadFutureModule<TripControllerModule>(
      '../../src/modules/trip/hooks/useTripWorkspace.hook',
    )
    const client = createMutationRecordingClient()

    const blindController = createTripController({ client, permissions: [] })
    expect(blindController.canReadTrips).toBe(false)
    expect(blindController.canManageTrips).toBe(false)
    expect(
      await blindController.getTrip({ tripId: TRIP_ID }).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'TRIP_FORBIDDEN' }))

    const readOnlyController = createTripController({ client, permissions: [FLEET_READ] })
    expect(readOnlyController.canReadTrips).toBe(true)
    expect(readOnlyController.canManageTrips).toBe(false)
    expect(await readOnlyController.getTrip({ tripId: TRIP_ID })).toEqual(TRIP_DETAIL)
    expect(
      await readOnlyController.createTrip(CREATE_TRIP_BODY).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'TRIP_FORBIDDEN' }))
    expect(
      await readOnlyController.closeTrip({ tripId: TRIP_ID }).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'TRIP_FORBIDDEN' }))
    expect(client.mutationCount).toBe(0)

    const controller = createTripController({ client, permissions: [FLEET_READ, FLEET_MANAGE] })
    expect(controller.canManageTrips).toBe(true)
    await controller.createTrip(CREATE_TRIP_BODY)
    await controller.closeTrip({ tripId: TRIP_ID })
    await controller.linkTripDocument({ freightCalculationId: null, nfeDocumentId: NFE_DOCUMENT_ID, tripId: TRIP_ID })
    await controller.deliverTripDocument({ documentId: DOCUMENT_ID, tripId: TRIP_ID })
    await controller.releaseTripDocument({ documentId: DOCUMENT_ID, tripId: TRIP_ID })
    expect(client.mutationCount).toBe(5)
  })
})

async function createRecordingClient(requests: Request[]): Promise<TripClient> {
  const { createTripClient } = await loadFutureModule<TripClientModule>(
    '../../src/modules/trip/shared/tripClient.service',
  )
  return createTripClient({
    apiUrl: API_URL,
    fetch: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      return resolveSyntheticResponse(request)
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

function resolveSyntheticResponse(request: Request): Promise<Response> {
  if (request.url.startsWith(`${TRIPS_PATH}?`)) {
    return Promise.resolve(
      Response.json({ data: TRIP_PAGE.items, page: { nextCursor: TRIP_PAGE.nextCursor } }),
    )
  }
  if (request.url === TRIPS_PATH && request.method === 'POST') {
    return Promise.resolve(Response.json({ data: TRIP_DETAIL }, { status: 201 }))
  }
  if (request.url === `${TRIPS_PATH}/${TRIP_ID}/close`) {
    return Promise.resolve(Response.json({ data: TRIP_DETAIL }))
  }
  if (request.url === `${TRIPS_PATH}/${TRIP_ID}/documents`) {
    return Promise.resolve(Response.json({ data: TRIP_DOCUMENT }, { status: 201 }))
  }
  if (request.url === `${TRIPS_PATH}/${TRIP_ID}/documents/${DOCUMENT_ID}/deliver`) {
    return Promise.resolve(Response.json({ data: TRIP_DOCUMENT }))
  }
  if (request.url === `${TRIPS_PATH}/${TRIP_ID}/documents/${DOCUMENT_ID}` && request.method === 'DELETE') {
    return Promise.resolve(Response.json({ data: TRIP_DOCUMENT }))
  }
  if (request.url === `${TRIPS_PATH}/${TRIP_ID}`) {
    return Promise.resolve(Response.json({ data: TRIP_DETAIL }))
  }

  throw new Error(`Unexpected request in contract: ${request.url}`)
}

function createMutationRecordingClient(): TripClient & { readonly mutationCount: number } {
  let mutationCount = 0
  const recordDetailMutation = (): Promise<unknown> => {
    mutationCount += 1
    return Promise.resolve(TRIP_DETAIL)
  }
  const recordDocumentMutation = (): Promise<unknown> => {
    mutationCount += 1
    return Promise.resolve(TRIP_DOCUMENT)
  }

  return {
    closeTrip: recordDetailMutation,
    createTrip: recordDetailMutation,
    deliverTripDocument: recordDocumentMutation,
    getTrip: () => Promise.resolve(TRIP_DETAIL),
    linkTripDocument: recordDocumentMutation,
    listTrips: () => Promise.resolve(TRIP_PAGE),
    get mutationCount(): number {
      return mutationCount
    },
    releaseTripDocument: recordDocumentMutation,
  }
}

type ListInput = Readonly<{
  cursor: null | string
  filters?: Readonly<Record<string, string | undefined>>
  limit: number
}>
type TripIdInput = Readonly<{ tripId: string }>
type DocumentActionInput = Readonly<{ documentId: string; tripId: string }>
type LinkDocumentInput = Readonly<{
  freightCalculationId: null | string
  nfeDocumentId: null | string
  tripId: string
}>

type TripClient = {
  closeTrip(input: TripIdInput): Promise<unknown>
  createTrip(input: typeof CREATE_TRIP_BODY): Promise<unknown>
  deliverTripDocument(input: DocumentActionInput): Promise<unknown>
  getTrip(input: TripIdInput): Promise<unknown>
  linkTripDocument(input: LinkDocumentInput): Promise<unknown>
  listTrips(input: ListInput): Promise<unknown>
  releaseTripDocument(input: DocumentActionInput): Promise<unknown>
}

type TripClientModule = {
  readonly createTripClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => TripClient
}

type TripAdaptersModule = {
  readonly createTripResponseAdapters: () => {
    readonly tripDetailFromApi: (input: unknown) => unknown
    readonly tripDocumentFromApi: (input: unknown) => unknown
    readonly tripFromApi: (input: unknown) => unknown
    readonly tripListFromApi: (input: unknown) => unknown
  }
}

type TripController = {
  readonly canManageTrips: boolean
  readonly canReadTrips: boolean
  readonly closeTrip: (input: TripIdInput) => Promise<unknown>
  readonly createTrip: (input: typeof CREATE_TRIP_BODY) => Promise<unknown>
  readonly deliverTripDocument: (input: DocumentActionInput) => Promise<unknown>
  readonly getTrip: (input: TripIdInput) => Promise<unknown>
  readonly linkTripDocument: (input: LinkDocumentInput) => Promise<unknown>
  readonly releaseTripDocument: (input: DocumentActionInput) => Promise<unknown>
}

type TripControllerModule = {
  readonly createTripController: (input: {
    readonly client: TripClient
    readonly permissions: readonly string[]
  }) => TripController
}
