/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DRIVER_BODY_KEYS,
  FLEET_CAPABILITIES_PATH,
  FLEET_DRIVERS_PATH,
  FLEET_ERROR,
  FLEET_VEHICLES_PATH,
  OWNER_KEYS,
  VEHICLE_BODY_KEYS,
} from './fleet.constant'
import type {
  FleetCapabilities,
  FleetDriverBody,
  FleetDriverDetail,
  FleetDriverFilters,
  FleetDriverPage,
  FleetDriverVehicleLink,
  FleetDriverVehiclesInput,
  FleetDriverVersionInput,
  FleetListInput,
  FleetReplaceDriverVehiclesInput,
  FleetVehicleBody,
  FleetVehicleDetail,
  FleetVehicleFilters,
  FleetVehiclePage,
  FleetVehicleVersionInput,
} from './fleet.types'
import { isRecord, isString } from './fleetGuards.validation'
import { createFleetResponseAdapters } from './fleetResponse.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type FleetClient = Readonly<{
  createDriver: (input: FleetDriverBody) => Promise<FleetDriverDetail>
  createVehicle: (input: FleetVehicleBody) => Promise<FleetVehicleDetail>
  getFleetCapabilities: () => Promise<FleetCapabilities>
  listDriverVehicles: (
    input: FleetDriverVehiclesInput,
  ) => Promise<readonly FleetDriverVehicleLink[]>
  listDrivers: (input: FleetListInput<FleetDriverFilters>) => Promise<FleetDriverPage>
  listVehicles: (input: FleetListInput<FleetVehicleFilters>) => Promise<FleetVehiclePage>
  replaceDriverVehicles: (
    input: FleetReplaceDriverVehiclesInput,
  ) => Promise<readonly FleetDriverVehicleLink[]>
  updateDriver: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
  updateVehicle: (input: FleetVehicleBody & FleetVehicleVersionInput) => Promise<FleetVehicleDetail>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return FLEET_ERROR.REQUEST_FAILED
}

async function requestJson(
  input: Readonly<{ fetch: ClientDependencies['fetch']; request: Request }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch {
    throw requestError(FLEET_ERROR.REQUEST_FAILED)
  }
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(rawBody) as unknown
  } catch {
    throw requestError(response.ok ? FLEET_ERROR.RESPONSE_INVALID : FLEET_ERROR.REQUEST_FAILED)
  }
  if (!response.ok) throw requestError(readErrorCode(payload))
  return payload
}

async function authorizedRequest(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'GET' | 'PATCH' | 'POST' | 'PUT'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body

  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
  })
}

function driverVehiclesPath(driverId: string): string {
  return `${FLEET_DRIVERS_PATH}/${driverId}/vehicles`
}

function readEnvelopeData(input: unknown): unknown {
  if (!isRecord(input) || !('data' in input)) throw requestError(FLEET_ERROR.RESPONSE_INVALID)
  return input.data
}

function buildSearch(
  input: Readonly<{ cursor: null | string; limit: number }>,
  filters: Readonly<Record<string, string | undefined>>,
): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('limit', String(input.limit))
  for (const key of Object.keys(filters).sort()) {
    const value = filters[key]
    if (value !== undefined && value.length > 0) search.set(key, value)
  }
  return search.toString()
}

function pickKeys<TValue>(value: TValue, keys: readonly string[]): TValue {
  const source = value as Record<string, unknown>
  const picked: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in source) picked[key] = source[key]
  }
  return picked as TValue
}

function cleanVehicleBody(input: FleetVehicleBody): FleetVehicleBody {
  const body = pickKeys(input, VEHICLE_BODY_KEYS)
  return { ...body, owner: body.owner === null ? null : pickKeys(body.owner, OWNER_KEYS) }
}

export function createFleetClient(dependencies: ClientDependencies): FleetClient {
  const adapters = createFleetResponseAdapters()

  return {
    async createDriver(input) {
      const response = await authorizedRequest({
        body: JSON.stringify(pickKeys(input, DRIVER_BODY_KEYS)),
        dependencies,
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      })
      return adapters.driverFromApi(readEnvelopeData(response))
    },
    async createVehicle(input) {
      const response = await authorizedRequest({
        body: JSON.stringify(cleanVehicleBody(input)),
        dependencies,
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      })
      return adapters.vehicleFromApi(readEnvelopeData(response))
    },
    async getFleetCapabilities() {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: FLEET_CAPABILITIES_PATH,
      })
      return adapters.capabilitiesFromApi(readEnvelopeData(response))
    },
    async listDriverVehicles(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: driverVehiclesPath(input.driverId),
      })
      return adapters.driverVehicleListFromApi(response)
    },
    async listDrivers(input) {
      const search = buildSearch(input, {
        nameContains: input.filters?.nameContains,
        statusEq: input.filters?.statusEq,
      })
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${FLEET_DRIVERS_PATH}?${search}`,
      })
      return adapters.driverListFromApi(response)
    },
    async listVehicles(input) {
      const search = buildSearch(input, {
        plateContains: input.filters?.plateContains,
        roleEq: input.filters?.roleEq,
        statusEq: input.filters?.statusEq,
      })
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${FLEET_VEHICLES_PATH}?${search}`,
      })
      return adapters.vehicleListFromApi(response)
    },
    async replaceDriverVehicles(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ vehicleIds: input.vehicleIds }),
        dependencies,
        method: 'PUT',
        path: driverVehiclesPath(input.driverId),
      })
      return adapters.driverVehicleListFromApi(response)
    },
    async updateDriver(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          ...pickKeys(input, DRIVER_BODY_KEYS),
          expectedVersion: input.expectedVersion,
          status: input.status,
        }),
        dependencies,
        method: 'PATCH',
        path: `${FLEET_DRIVERS_PATH}/${input.driverId}`,
      })
      return adapters.driverFromApi(readEnvelopeData(response))
    },
    async updateVehicle(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          ...cleanVehicleBody(input),
          expectedVersion: input.expectedVersion,
          status: input.status,
        }),
        dependencies,
        method: 'PATCH',
        path: `${FLEET_VEHICLES_PATH}/${input.vehicleId}`,
      })
      return adapters.vehicleFromApi(readEnvelopeData(response))
    },
  }
}
