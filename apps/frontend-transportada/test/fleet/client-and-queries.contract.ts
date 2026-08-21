/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import type {
  FleetDriverBodyContract,
  FleetDriverCreateBodyContract,
  FleetVehicleBodyContract,
} from './fleet.fixture'
import {
  AGGREGATE_VEHICLE_BODY,
  DRIVER_BODY,
  DRIVER_CREATE_BODY,
  DRIVER_DETAIL,
  DRIVER_ID,
  DRIVER_PAGE,
  loadFutureModule,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  VEHICLE_BODY,
  VEHICLE_DETAIL,
  VEHICLE_ID,
  VEHICLE_PAGE,
} from './fleet.fixture'

const API_URL = 'https://api.example.test'
const VEHICLES_PATH = `${API_URL}/fleet/vehicles`
const DRIVERS_PATH = `${API_URL}/fleet/drivers`

describe('fleet client contract', () => {
  test('lists, creates and versions vehicles and drivers over authenticated no-store requests', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    expect(
      await client.listVehicles({
        cursor: SYNTHETIC_CURSOR,
        filters: { plateContains: 'ABC', roleEq: 'traction', statusEq: 'active' },
        limit: 25,
      }),
    ).toEqual(VEHICLE_PAGE)
    expect(await client.createVehicle(VEHICLE_BODY)).toEqual(VEHICLE_DETAIL)
    expect(
      await client.updateVehicle({
        ...AGGREGATE_VEHICLE_BODY,
        expectedVersion: '1',
        status: 'inactive',
        vehicleId: VEHICLE_ID,
      }),
    ).toEqual(VEHICLE_DETAIL)
    expect(
      await client.listDrivers({
        cursor: null,
        filters: { nameContains: 'Jose', statusEq: 'active' },
        limit: 50,
      }),
    ).toEqual(DRIVER_PAGE)
    expect(await client.createDriver(DRIVER_CREATE_BODY)).toEqual(DRIVER_DETAIL)
    expect(
      await client.updateDriver({
        ...DRIVER_BODY,
        driverId: DRIVER_ID,
        expectedVersion: '1',
        status: 'active',
      }),
    ).toEqual(DRIVER_DETAIL)

    const [
      listVehiclesRequest,
      createVehicleRequest,
      updateVehicleRequest,
      listDriversRequest,
      createDriverRequest,
      updateDriverRequest,
    ] = requests
    if (
      listVehiclesRequest === undefined ||
      createVehicleRequest === undefined ||
      updateVehicleRequest === undefined ||
      listDriversRequest === undefined ||
      createDriverRequest === undefined ||
      updateDriverRequest === undefined
    ) {
      throw new Error('FLEET_CONTRACT_REQUEST_MISSING')
    }

    expect(listVehiclesRequest.url).toBe(
      `${VEHICLES_PATH}?cursor=${encodeURIComponent(SYNTHETIC_CURSOR)}&limit=25&plateContains=ABC&roleEq=traction&statusEq=active`,
    )
    expect(listVehiclesRequest.method).toBe('GET')
    expect(listVehiclesRequest.headers.get('authorization')).toBe(
      `Bearer ${SYNTHETIC_ACCESS_TOKEN}`,
    )
    expect(listVehiclesRequest.cache).toBe('no-store')

    expect(createVehicleRequest.url).toBe(VEHICLES_PATH)
    expect(createVehicleRequest.method).toBe('POST')
    expect(createVehicleRequest.headers.get('content-type')).toBe('application/json')
    expect(await createVehicleRequest.json()).toEqual(VEHICLE_BODY)

    expect(updateVehicleRequest.url).toBe(`${VEHICLES_PATH}/${VEHICLE_ID}`)
    expect(updateVehicleRequest.method).toBe('PATCH')
    expect(await updateVehicleRequest.json()).toEqual({
      ...AGGREGATE_VEHICLE_BODY,
      expectedVersion: '1',
      status: 'inactive',
    })

    expect(listDriversRequest.url).toBe(
      `${DRIVERS_PATH}?limit=50&nameContains=Jose&statusEq=active`,
    )
    expect(listDriversRequest.cache).toBe('no-store')

    expect(createDriverRequest.url).toBe(DRIVERS_PATH)
    expect(createDriverRequest.method).toBe('POST')
    expect(await createDriverRequest.json()).toEqual(DRIVER_CREATE_BODY)

    expect(updateDriverRequest.url).toBe(`${DRIVERS_PATH}/${DRIVER_ID}`)
    expect(updateDriverRequest.method).toBe('PATCH')
    expect(await updateDriverRequest.json()).toEqual({
      ...DRIVER_BODY,
      expectedVersion: '1',
      status: 'active',
    })
  })

  test('never smuggles the tenant identifier into the request path or body', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    await client.createVehicle({
      ...AGGREGATE_VEHICLE_BODY,
      companyId: 'forbidden-company',
      owner: { ...AGGREGATE_VEHICLE_BODY.owner, companyId: 'forbidden-company' },
    } as never)
    await client.createDriver({ ...DRIVER_CREATE_BODY, companyId: 'forbidden-company' } as never)

    const [createVehicleRequest, createDriverRequest] = requests
    if (createVehicleRequest === undefined || createDriverRequest === undefined) {
      throw new Error('FLEET_CONTRACT_REQUEST_MISSING')
    }
    expect(JSON.stringify(await createVehicleRequest.json())).not.toContain('forbidden-company')
    expect(JSON.stringify(await createDriverRequest.json())).not.toContain('forbidden-company')
  })

  test('surfaces the api error code instead of a generic failure', async () => {
    const { createFleetClient } = await loadFutureModule<FleetClientModule>(
      '../../src/modules/fleet/shared/fleetClient.service',
    )
    const client = createFleetClient({
      apiUrl: API_URL,
      fetch: () =>
        Promise.resolve(
          Response.json(
            { error: { code: 'FLEET_VEHICLE_VERSION_CONFLICT', message: 'conflict' } },
            { status: 409 },
          ),
        ),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(
      await client
        .updateVehicle({
          ...VEHICLE_BODY,
          expectedVersion: '1',
          status: 'active',
          vehicleId: VEHICLE_ID,
        })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_VEHICLE_VERSION_CONFLICT' }))
  })

  test('keeps the fleet dto strict, decimal-safe and free of tenant fields', async () => {
    const { createFleetResponseAdapters } = await loadFutureModule<FleetAdaptersModule>(
      '../../src/modules/fleet/shared/fleetResponse.validation',
    )
    const adapters = createFleetResponseAdapters()

    expect(adapters.vehicleFromApi(VEHICLE_DETAIL)).toEqual(VEHICLE_DETAIL)
    expect(adapters.driverFromApi(DRIVER_DETAIL)).toEqual(DRIVER_DETAIL)

    expect(() =>
      adapters.vehicleFromApi({ ...VEHICLE_DETAIL, companyId: 'forbidden-company' }),
    ).toThrow('FLEET_RESPONSE_INVALID')
    expect(() => adapters.vehicleFromApi({ ...VEHICLE_DETAIL, capacityKilograms: 27000 })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
    expect(() => adapters.vehicleFromApi({ ...VEHICLE_DETAIL, role: 'semi_trailer' })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
    expect(() =>
      adapters.vehicleFromApi({
        ...VEHICLE_DETAIL,
        owner: { ...VEHICLE_DETAIL, taxRegime: '9' },
        ownership: 'aggregate',
      }),
    ).toThrow('FLEET_RESPONSE_INVALID')
    expect(() =>
      adapters.driverFromApi({ ...DRIVER_DETAIL, companyId: 'forbidden-company' }),
    ).toThrow('FLEET_RESPONSE_INVALID')
    expect(() => adapters.driverFromApi({ ...DRIVER_DETAIL, membershipId: 42 })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
    expect(() => adapters.vehicleListFromApi({ data: [VEHICLE_DETAIL], page: null })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
    expect(() =>
      adapters.driverListFromApi({ data: [{ ...DRIVER_DETAIL, xml: '<mdfeProc />' }], page: {} }),
    ).toThrow('FLEET_RESPONSE_INVALID')
  })
})

async function createRecordingClient(requests: Request[]): Promise<FleetClient> {
  const { createFleetClient } = await loadFutureModule<FleetClientModule>(
    '../../src/modules/fleet/shared/fleetClient.service',
  )
  return createFleetClient({
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
  if (request.url.startsWith(`${VEHICLES_PATH}?`)) {
    return Promise.resolve(
      Response.json({ data: VEHICLE_PAGE.items, page: { nextCursor: VEHICLE_PAGE.nextCursor } }),
    )
  }
  if (request.url.startsWith(`${DRIVERS_PATH}?`) || request.url === DRIVERS_PATH) {
    if (request.method === 'GET') {
      return Promise.resolve(
        Response.json({ data: DRIVER_PAGE.items, page: { nextCursor: DRIVER_PAGE.nextCursor } }),
      )
    }
    return Promise.resolve(Response.json({ data: DRIVER_DETAIL }, { status: 201 }))
  }
  if (request.url === VEHICLES_PATH) {
    return Promise.resolve(Response.json({ data: VEHICLE_DETAIL }, { status: 201 }))
  }
  if (request.url.startsWith(`${VEHICLES_PATH}/`)) {
    return Promise.resolve(Response.json({ data: VEHICLE_DETAIL }))
  }
  if (request.url.startsWith(`${DRIVERS_PATH}/`)) {
    return Promise.resolve(Response.json({ data: DRIVER_DETAIL }))
  }

  throw new Error(`Unexpected request in contract: ${request.url}`)
}

type FleetClient = {
  createDriver(input: FleetDriverCreateBodyContract): Promise<unknown>
  createVehicle(input: FleetVehicleBodyContract): Promise<unknown>
  listDrivers(input: {
    readonly cursor: null | string
    readonly filters?: Readonly<{ nameContains?: string; statusEq?: string }>
    readonly limit: number
  }): Promise<unknown>
  listVehicles(input: {
    readonly cursor: null | string
    readonly filters?: Readonly<{ plateContains?: string; roleEq?: string; statusEq?: string }>
    readonly limit: number
  }): Promise<unknown>
  updateDriver(
    input: FleetDriverBodyContract & {
      readonly driverId: string
      readonly expectedVersion: string
      readonly status: 'active' | 'inactive'
    },
  ): Promise<unknown>
  updateVehicle(
    input: FleetVehicleBodyContract & {
      readonly expectedVersion: string
      readonly status: 'active' | 'inactive'
      readonly vehicleId: string
    },
  ): Promise<unknown>
}

type FleetClientModule = {
  readonly createFleetClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => FleetClient
}

type FleetAdaptersModule = {
  readonly createFleetResponseAdapters: () => {
    readonly driverFromApi: (input: unknown) => unknown
    readonly driverListFromApi: (input: unknown) => unknown
    readonly vehicleFromApi: (input: unknown) => unknown
    readonly vehicleListFromApi: (input: unknown) => unknown
  }
}
