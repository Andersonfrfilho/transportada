/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DRIVER_BODY_KEYS,
  DRIVER_CREATE_BODY_KEYS,
  DRIVER_AVAILABILITY_PATH,
  FLEET_CAPABILITIES_PATH,
  FLEET_DRIVER_VEHICLE_LINKS_PATH,
  FLEET_DRIVERS_PATH,
  FLEET_ERROR,
  FLEET_VEHICLES_PATH,
  FREIGHT_REGION_BODY_KEYS,
  FREIGHT_REGION_IMPORT_KEYS,
  FREIGHT_REGIONS_PATH,
  OWNER_KEYS,
  VEHICLE_BODY_KEYS,
} from './fleet.constant'
import type { FleetDriverCoverage } from './driverCoverage.service'
import type {
  FleetCapabilities,
  FleetDriverAvailability,
  FleetDriverAvailabilityInput,
  FleetDriverBody,
  FleetDriverCreateBody,
  FleetDriverDetail,
  FleetDriverFilters,
  FleetDriverPage,
  FleetDriverRegionsInput,
  FleetDriverVehicleLink,
  FleetDriverVehiclePair,
  FleetDriverVehiclesInput,
  FleetDriverVersionInput,
  FleetListInput,
  FleetReplaceDriverRegionsInput,
  FleetReplaceDriverVehiclesInput,
  FleetVehicleBody,
  FleetVehicleDetail,
  FleetVehicleFilters,
  FleetVehiclePage,
  FleetVehicleVersionInput,
} from './fleet.types'
import { isRecord, isString } from './fleetGuards.validation'
import {
  FleetRequestError,
  readErrorDetails,
  type FleetErrorDetail,
} from './fleetRequestError.service'
import type {
  FreightRegion,
  FreightRegionBodyInput,
  FreightRegionDeleteInput,
  FreightRegionFilters,
  FreightRegionImportInput,
  FreightRegionImportSummary,
  FreightRegionPage,
  FreightRegionUpdateInput,
} from './freightRegion.types'
import { createFleetResponseAdapters } from './fleetResponse.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type FleetClient = Readonly<{
  checkDriverAvailability: (input: FleetDriverAvailabilityInput) => Promise<FleetDriverAvailability>
  createDriver: (input: FleetDriverCreateBody) => Promise<FleetDriverDetail>
  createFreightRegion: (input: FreightRegionBodyInput) => Promise<FreightRegion>
  createVehicle: (input: FleetVehicleBody) => Promise<FleetVehicleDetail>
  deleteFreightRegion: (input: FreightRegionDeleteInput) => Promise<void>
  getFleetCapabilities: () => Promise<FleetCapabilities>
  importFreightRegions: (input: FreightRegionImportInput) => Promise<FreightRegionImportSummary>
  listDriverRegions: (input: FleetDriverRegionsInput) => Promise<readonly FleetDriverCoverage[]>
  listDriverVehicles: (
    input: FleetDriverVehiclesInput,
  ) => Promise<readonly FleetDriverVehicleLink[]>
  /** Spec 081: o vínculo da empresa inteiro, em pares. Sem argumento: o recorte é o tenant. */
  listDriverVehiclePairs: () => Promise<readonly FleetDriverVehiclePair[]>
  listDrivers: (input: FleetListInput<FleetDriverFilters>) => Promise<FleetDriverPage>
  listFreightRegions: (input: FleetListInput<FreightRegionFilters>) => Promise<FreightRegionPage>
  listVehicles: (input: FleetListInput<FleetVehicleFilters>) => Promise<FleetVehiclePage>
  replaceDriverRegions: (
    input: FleetReplaceDriverRegionsInput,
  ) => Promise<readonly FleetDriverCoverage[]>
  replaceDriverVehicles: (
    input: FleetReplaceDriverVehiclesInput,
  ) => Promise<readonly FleetDriverVehicleLink[]>
  updateDriver: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
  updateFreightRegion: (input: FreightRegionUpdateInput) => Promise<FreightRegion>
  updateVehicle: (input: FleetVehicleBody & FleetVehicleVersionInput) => Promise<FleetVehicleDetail>
}>

function requestError(code: string, details: readonly FleetErrorDetail[] = []): Error {
  return new FleetRequestError(code, details)
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
  // `DELETE /freight-regions/{id}` responde 204 sem corpo: ler JSON dele derrubaria o que deu certo.
  if (rawBody.length === 0) {
    if (!response.ok) throw requestError(FLEET_ERROR.REQUEST_FAILED)
    return undefined
  }
  let payload: unknown
  try {
    payload = JSON.parse(rawBody) as unknown
  } catch {
    throw requestError(response.ok ? FLEET_ERROR.RESPONSE_INVALID : FLEET_ERROR.REQUEST_FAILED)
  }
  if (!response.ok) throw requestError(readErrorCode(payload), readErrorDetails(payload))
  return payload
}

async function authorizedRequest(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
    path: string
    signal?: AbortSignal
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body
  // Tecla nova cancela a conferência anterior: resposta atrasada pintaria campo já corrigido
  if (input.signal !== undefined) requestInit.signal = input.signal

  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
  })
}

function freightRegionPath(regionId: string): string {
  return `${FREIGHT_REGIONS_PATH}/${regionId}`
}

/**
 * A conferência prévia manda só o que está preenchido: campo em branco é ausência, e mandá-lo vazio
 * faria a rota comparar o nada com a tabela inteira.
 */
function driverAvailabilityPath(input: FleetDriverAvailabilityInput): string {
  const search = new URLSearchParams()
  if (input.driverId !== null) search.set('driverId', input.driverId)
  if (input.email !== '') search.set('email', input.email)
  if (input.licenseNumber !== '') search.set('licenseNumber', input.licenseNumber)
  if (input.taxId !== '') search.set('taxId', input.taxId)
  const query = search.toString()
  return query === '' ? DRIVER_AVAILABILITY_PATH : `${DRIVER_AVAILABILITY_PATH}?${query}`
}

function driverRegionsPath(driverId: string): string {
  return `${FLEET_DRIVERS_PATH}/${driverId}/regions`
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
    async checkDriverAvailability(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: driverAvailabilityPath(input),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })
      return adapters.driverAvailabilityFromApi(readEnvelopeData(response))
    },
    async createDriver(input) {
      const response = await authorizedRequest({
        body: JSON.stringify(pickKeys(input, DRIVER_CREATE_BODY_KEYS)),
        dependencies,
        method: 'POST',
        path: FLEET_DRIVERS_PATH,
      })
      return adapters.driverFromApi(readEnvelopeData(response))
    },
    async createFreightRegion(input) {
      const response = await authorizedRequest({
        body: JSON.stringify(pickKeys(input, FREIGHT_REGION_BODY_KEYS)),
        dependencies,
        method: 'POST',
        path: FREIGHT_REGIONS_PATH,
      })
      return adapters.freightRegionFromApi(readEnvelopeData(response))
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
    async deleteFreightRegion(input) {
      await authorizedRequest({
        dependencies,
        method: 'DELETE',
        path: freightRegionPath(input.regionId),
      })
    },
    async getFleetCapabilities() {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: FLEET_CAPABILITIES_PATH,
      })
      return adapters.capabilitiesFromApi(readEnvelopeData(response))
    },
    async importFreightRegions(input) {
      const response = await authorizedRequest({
        body: JSON.stringify(pickKeys(input, FREIGHT_REGION_IMPORT_KEYS)),
        dependencies,
        method: 'POST',
        path: `${FREIGHT_REGIONS_PATH}/import`,
      })
      return adapters.freightRegionImportSummaryFromApi(readEnvelopeData(response))
    },
    async listDriverRegions(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: driverRegionsPath(input.driverId),
      })
      return adapters.driverCoverageListFromApi(response)
    },
    async listDriverVehicles(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: driverVehiclesPath(input.driverId),
      })
      return adapters.driverVehicleListFromApi(response)
    },
    async listDriverVehiclePairs() {
      return adapters.driverVehiclePairListFromApi(
        await authorizedRequest({
          dependencies,
          method: 'GET',
          path: FLEET_DRIVER_VEHICLE_LINKS_PATH,
        }),
      )
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
    async listFreightRegions(input) {
      const search = buildSearch(input, {
        cityContains: input.filters?.cityContains,
        statusEq: input.filters?.statusEq,
      })
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${FREIGHT_REGIONS_PATH}?${search}`,
      })
      return adapters.freightRegionListFromApi(response)
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
    async replaceDriverRegions(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ entries: input.entries }),
        dependencies,
        method: 'PUT',
        path: driverRegionsPath(input.driverId),
      })
      return adapters.driverCoverageListFromApi(response)
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
    async updateFreightRegion(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          ...pickKeys(input, FREIGHT_REGION_BODY_KEYS),
          expectedVersion: input.expectedVersion,
          status: input.status,
        }),
        dependencies,
        method: 'PUT',
        path: freightRegionPath(input.regionId),
      })
      return adapters.freightRegionFromApi(readEnvelopeData(response))
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
