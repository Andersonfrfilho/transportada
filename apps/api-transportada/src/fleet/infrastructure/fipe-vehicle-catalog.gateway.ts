/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetVehicleCatalogPort,
  ListVehicleCatalogBrandsInput,
  ListVehicleCatalogModelsInput,
  VehicleCatalogItem,
  VehicleCatalogResult,
} from '../application/fleet-vehicle-catalog.port.js'
import {
  FLEET_VEHICLE_CATALOG_FAILURE,
  FleetVehicleCatalogFailedError,
} from '../domain/fleet.error.js'
import { resolveVehicleCatalogSegment } from '../domain/vehicle-catalog-segment.policy.js'

const ACCEPT_HEADER = 'application/json'
const REQUEST_TIMEOUT_MILLISECONDS = 8000

export type VehicleCatalogConfiguration = {
  readonly url: string
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>

type FipeBrand = { readonly nome: string; readonly valor: string }
type FipeModel = { readonly modelo: string; readonly valor: string }

export function createFipeVehicleCatalogGateway(dependencies: {
  readonly configuration: VehicleCatalogConfiguration
  readonly fetch: Fetch
}): FleetVehicleCatalogPort {
  return {
    async listBrands(input: ListVehicleCatalogBrandsInput): Promise<VehicleCatalogResult> {
      const segment = resolveVehicleCatalogSegment(input)
      if (segment === 'none') return { items: [], source: 'none' }

      const target = `${dependencies.configuration.url}/api/fipe/marcas/v1/${segment}`
      const entries = await fetchRecords({ fetch: dependencies.fetch, target })
      return { items: mapBrands(entries), source: 'fipe' }
    },

    async listModels(input: ListVehicleCatalogModelsInput): Promise<VehicleCatalogResult> {
      const segment = resolveVehicleCatalogSegment(input)
      if (segment === 'none') return { items: [], source: 'none' }

      const target = `${dependencies.configuration.url}/api/fipe/veiculos/v1/${segment}/${input.brand}`
      const entries = await fetchRecords({ fetch: dependencies.fetch, target })
      return { items: mapModels(entries), source: 'fipe' }
    },
  }
}

function mapBrands(entries: readonly Record<string, unknown>[]): readonly VehicleCatalogItem[] {
  return entries.map((entry) => ({
    label: String((entry as FipeBrand).nome ?? ''),
    value: String((entry as FipeBrand).valor ?? ''),
  }))
}

function mapModels(entries: readonly Record<string, unknown>[]): readonly VehicleCatalogItem[] {
  return entries.map((entry) => ({
    label: String((entry as FipeModel).modelo ?? ''),
    value: String((entry as FipeModel).valor ?? ''),
  }))
}

async function fetchRecords(input: {
  readonly fetch: Fetch
  readonly target: string
}): Promise<readonly Record<string, unknown>[]> {
  const response = await request(input)
  if (!response.ok) {
    throw new FleetVehicleCatalogFailedError({
      failure: FLEET_VEHICLE_CATALOG_FAILURE.PROVIDER_STATUS,
      providerStatus: response.status,
    })
  }
  const payload = await readJson(response)
  if (!Array.isArray(payload)) {
    throw new FleetVehicleCatalogFailedError({
      failure: FLEET_VEHICLE_CATALOG_FAILURE.MALFORMED_BODY,
      providerStatus: response.status,
    })
  }
  return payload as readonly Record<string, unknown>[]
}

async function request(input: {
  readonly fetch: Fetch
  readonly target: string
}): Promise<Response> {
  try {
    return await input.fetch(input.target, {
      headers: { accept: ACCEPT_HEADER },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    })
  } catch {
    // Sem resposta não há código a atribuir: rede caída, DNS e o prazo estourado caem todos aqui.
    throw new FleetVehicleCatalogFailedError({
      failure: FLEET_VEHICLE_CATALOG_FAILURE.TRANSPORT,
    })
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new FleetVehicleCatalogFailedError({
      failure: FLEET_VEHICLE_CATALOG_FAILURE.MALFORMED_BODY,
      providerStatus: response.status,
    })
  }
}
