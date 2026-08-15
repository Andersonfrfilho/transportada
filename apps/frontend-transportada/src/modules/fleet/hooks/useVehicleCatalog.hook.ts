/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import type {
  FleetVehicleCatalogBrandsInput,
  FleetVehicleCatalogModelsInput,
  FleetVehicleCatalogResult,
} from '../shared/fleet.types'
import {
  createFleetCatalogClient,
  type FleetCatalogClient,
} from '../shared/fleetCatalogClient.service'
import { createFleetController, getFleetClient } from './useFleet.hook'

const FLEET_CAPABILITIES_QUERY_KEY = 'fleet-capabilities'

export type VehicleCatalogController = Readonly<{
  canUseCatalog: boolean
  listBrands: (input: FleetVehicleCatalogBrandsInput) => Promise<FleetVehicleCatalogResult>
  listModels: (input: FleetVehicleCatalogModelsInput) => Promise<FleetVehicleCatalogResult>
}>

function getFleetCatalogClient(): FleetCatalogClient {
  return createFleetCatalogClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useVehicleCatalog(
  input: Readonly<{ companyId?: string; permissions: readonly string[] }>,
): VehicleCatalogController {
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createFleetController({ client: getFleetClient(), permissions })
  const catalogClient = getFleetCatalogClient()
  const capabilitiesQuery = useQuery({
    enabled: controller.canManageFleet,
    queryFn: () => controller.getFleetCapabilities(),
    queryKey: [FLEET_CAPABILITIES_QUERY_KEY, input.companyId],
  })

  return {
    canUseCatalog: controller.canManageFleet && (capabilitiesQuery.data?.vehicleCatalog ?? false),
    listBrands: (query) => catalogClient.listVehicleCatalogBrands(query),
    listModels: (query) => catalogClient.listVehicleCatalogModels(query),
  }
}
