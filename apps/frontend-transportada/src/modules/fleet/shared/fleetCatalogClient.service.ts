/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  FLEET_ERROR,
  FLEET_VEHICLE_CATALOG_BRANDS_PATH,
  FLEET_VEHICLE_CATALOG_MODELS_PATH,
} from './fleet.constant'
import type {
  FleetVehicleCatalogBrandsInput,
  FleetVehicleCatalogModelsInput,
  FleetVehicleCatalogResult,
} from './fleet.types'
import { isRecord, isString } from './fleetGuards.validation'
import { createFleetResponseAdapters } from './fleetResponse.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type FleetCatalogClient = Readonly<{
  listVehicleCatalogBrands: (
    input: FleetVehicleCatalogBrandsInput,
  ) => Promise<FleetVehicleCatalogResult>
  listVehicleCatalogModels: (
    input: FleetVehicleCatalogModelsInput,
  ) => Promise<FleetVehicleCatalogResult>
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
  input: Readonly<{ dependencies: ClientDependencies; path: string }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'GET',
    }),
  })
}

function readEnvelopeData(input: unknown): unknown {
  if (!isRecord(input) || !('data' in input)) throw requestError(FLEET_ERROR.RESPONSE_INVALID)
  return input.data
}

function buildCatalogSearch(input: Readonly<Record<string, string>>): string {
  const search = new URLSearchParams()
  for (const key of Object.keys(input).sort()) {
    const value = input[key]
    if (value !== undefined && value.length > 0) search.set(key, value)
  }
  return search.toString()
}

export function createFleetCatalogClient(dependencies: ClientDependencies): FleetCatalogClient {
  const adapters = createFleetResponseAdapters()

  return {
    async listVehicleCatalogBrands(input) {
      const search = buildCatalogSearch({ role: input.role, wheelType: input.wheelType })
      const response = await authorizedRequest({
        dependencies,
        path: `${FLEET_VEHICLE_CATALOG_BRANDS_PATH}?${search}`,
      })
      return adapters.catalogResultFromApi(readEnvelopeData(response))
    },
    async listVehicleCatalogModels(input) {
      const search = buildCatalogSearch({
        brand: input.brand,
        role: input.role,
        wheelType: input.wheelType,
      })
      const response = await authorizedRequest({
        dependencies,
        path: `${FLEET_VEHICLE_CATALOG_MODELS_PATH}?${search}`,
      })
      return adapters.catalogResultFromApi(readEnvelopeData(response))
    },
  }
}
