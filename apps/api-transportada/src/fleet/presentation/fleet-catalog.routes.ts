/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_FLEET_VEHICLE_CATALOG_BRANDS_PATH,
  API_FLEET_VEHICLE_CATALOG_MODELS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  FleetVehicleCatalogPort,
  ListVehicleCatalogBrandsInput,
  ListVehicleCatalogModelsInput,
  VehicleCatalogItem,
  VehicleCatalogResult,
} from '../application/fleet-vehicle-catalog.port.js'
import {
  parseVehicleCatalogBrandsQuery,
  parseVehicleCatalogModelsQuery,
} from './fleet-catalog.schema.js'

const FLEET_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const

type Dependencies = {
  readonly vehicleCatalog: FleetVehicleCatalogPort
}

export function createFleetCatalogRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<ListVehicleCatalogBrandsInput>({
      async handle({ input }): Promise<Response> {
        const result = await dependencies.vehicleCatalog.listBrands(input)
        return jsonResponse({ body: { data: serializeCatalogResult(result) }, status: 200 })
      },
      method: 'GET',
      parse: ({ request }) => parseVehicleCatalogBrandsQuery(new URL(request.url)),
      pathname: API_FLEET_VEHICLE_CATALOG_BRANDS_PATH,
      policy: FLEET_READ_POLICY,
    }),
    defineRoute<ListVehicleCatalogModelsInput>({
      async handle({ input }): Promise<Response> {
        const result = await dependencies.vehicleCatalog.listModels(input)
        return jsonResponse({ body: { data: serializeCatalogResult(result) }, status: 200 })
      },
      method: 'GET',
      parse: ({ request }) => parseVehicleCatalogModelsQuery(new URL(request.url)),
      pathname: API_FLEET_VEHICLE_CATALOG_MODELS_PATH,
      policy: FLEET_READ_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeCatalogResult(result: VehicleCatalogResult): object {
  return { items: result.items.map(serializeCatalogItem), source: result.source }
}

function serializeCatalogItem(item: VehicleCatalogItem): object {
  return { code: item.value, name: item.label }
}
