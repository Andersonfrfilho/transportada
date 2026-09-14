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
import type { VehicleReference } from '../shared/vehicleSuggestion.service'

const FLEET_CAPABILITIES_QUERY_KEY = 'fleet-capabilities'
const VEHICLE_REFERENCES_QUERY_KEY = 'fleet-vehicle-references'
/**
 * O catálogo de mercado não muda enquanto alguém cadastra um caminhão: uma consulta por sessão
 * basta, e a lista tem nove linhas.
 */
const REFERENCES_STALE_TIME_MS = 60 * 60 * 1000

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

/**
 * Spec 093: o catálogo de referência de baú, que a ficha da frota consulta para sugerir a medida.
 *
 * ⚠️ **Falha vira lista vazia, nunca erro na tela.** Sem catálogo a ficha abre digitável e sem
 * sugestão — cadastro de veículo não pode parar porque um palpite não chegou.
 */
export function useVehicleReferences(
  input: Readonly<{ companyId?: string; permissions: readonly string[] }>,
): readonly VehicleReference[] {
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createFleetController({ client: getFleetClient(), permissions })
  const catalogClient = getFleetCatalogClient()

  const query = useQuery({
    enabled: controller.canReadFleet,
    queryFn: () => catalogClient.listVehicleReferences(),
    queryKey: [VEHICLE_REFERENCES_QUERY_KEY, input.companyId],
    staleTime: REFERENCES_STALE_TIME_MS,
  })

  return query.data ?? []
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
