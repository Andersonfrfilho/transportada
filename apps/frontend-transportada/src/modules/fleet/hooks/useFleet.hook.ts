/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  FLEET_DRIVER_LOAD_LIMIT,
  FLEET_ERROR,
  FLEET_MANAGE_PERMISSION,
  FLEET_PAGE_SIZE,
  FLEET_READ_PERMISSION,
  FLEET_VEHICLE_LOAD_LIMIT,
} from '../shared/fleet.constant'
import type { FleetDriverCoverage } from '../shared/driverCoverage.service'
import type {
  FleetCapabilities,
  FleetDriverBody,
  FleetDriverCreateBody,
  FleetDriverDetail,
  FleetDriverFilters,
  FleetDriverPage,
  FleetDriverRegionsInput,
  FleetDriverVehicleLink,
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
} from '../shared/fleet.types'
import { createFleetClient, type FleetClient } from '../shared/fleetClient.service'
import { createFleetViewModel, type FleetViewModel } from '../shared/fleetViewModel.service'

const FLEET_VEHICLES_QUERY_KEY = 'fleet-vehicles'
const FLEET_DRIVERS_QUERY_KEY = 'fleet-drivers'

export type FleetController = Readonly<{
  canManageFleet: boolean
  canReadFleet: boolean
  createDriver: (input: FleetDriverCreateBody) => Promise<FleetDriverDetail>
  createVehicle: (input: FleetVehicleBody) => Promise<FleetVehicleDetail>
  getFleetCapabilities: () => Promise<FleetCapabilities>
  listDriverRegions: (input: FleetDriverRegionsInput) => Promise<readonly FleetDriverCoverage[]>
  listDriverVehicles: (
    input: FleetDriverVehiclesInput,
  ) => Promise<readonly FleetDriverVehicleLink[]>
  listDrivers: (input: FleetListInput<FleetDriverFilters>) => Promise<FleetDriverPage>
  listVehicles: (input: FleetListInput<FleetVehicleFilters>) => Promise<FleetVehiclePage>
  replaceDriverRegions: (
    input: FleetReplaceDriverRegionsInput,
  ) => Promise<readonly FleetDriverCoverage[]>
  replaceDriverVehicles: (
    input: FleetReplaceDriverVehiclesInput,
  ) => Promise<readonly FleetDriverVehicleLink[]>
  updateDriver: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
  updateVehicle: (input: FleetVehicleBody & FleetVehicleVersionInput) => Promise<FleetVehicleDetail>
}>

type ControllerInput = Readonly<{
  client: FleetClient
  permissions: readonly string[]
}>

function forbidden(): Promise<never> {
  return Promise.reject(new Error(FLEET_ERROR.FORBIDDEN))
}

export function createFleetController(input: ControllerInput): FleetController {
  const canReadFleet = input.permissions.includes(FLEET_READ_PERMISSION)
  const canManageFleet = input.permissions.includes(FLEET_MANAGE_PERMISSION)

  return {
    canManageFleet,
    canReadFleet,
    createDriver: (body) => (canManageFleet ? input.client.createDriver(body) : forbidden()),
    createVehicle: (body) => (canManageFleet ? input.client.createVehicle(body) : forbidden()),
    getFleetCapabilities: () => (canReadFleet ? input.client.getFleetCapabilities() : forbidden()),
    listDriverRegions: (query) =>
      canReadFleet ? input.client.listDriverRegions(query) : forbidden(),
    listDriverVehicles: (query) =>
      canReadFleet ? input.client.listDriverVehicles(query) : forbidden(),
    listDrivers: (query) => (canReadFleet ? input.client.listDrivers(query) : forbidden()),
    listVehicles: (query) => (canReadFleet ? input.client.listVehicles(query) : forbidden()),
    replaceDriverRegions: (body) =>
      canManageFleet ? input.client.replaceDriverRegions(body) : forbidden(),
    replaceDriverVehicles: (body) =>
      canManageFleet ? input.client.replaceDriverVehicles(body) : forbidden(),
    updateDriver: (body) => (canManageFleet ? input.client.updateDriver(body) : forbidden()),
    updateVehicle: (body) => (canManageFleet ? input.client.updateVehicle(body) : forbidden()),
  }
}

export function getFleetClient(): FleetClient {
  return createFleetClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

type FleetQueryKey = readonly [string, string | undefined, string]

/**
 * A tabela ordena, filtra e soma sobre a frota inteira, então ela precisa da frota inteira: com uma
 * página só, "ordenar por R$/km" ordenaria os 25 primeiros e mentiria sobre o resto. O teto existe
 * para que cursor que não anda não vire laço infinito, não para recortar frota de verdade.
 */
async function loadEveryDriver(
  input: Readonly<{ controller: FleetController; filters: FleetDriverFilters }>,
): Promise<FleetDriverPage> {
  const items: FleetDriverDetail[] = []
  let cursor: null | string = null

  do {
    const page: FleetDriverPage = await input.controller.listDrivers({
      cursor,
      filters: input.filters,
      limit: FLEET_PAGE_SIZE,
    })
    items.push(...page.items)
    cursor = page.nextCursor
  } while (cursor !== null && items.length < FLEET_DRIVER_LOAD_LIMIT)

  return { items, nextCursor: null }
}

async function loadEveryVehicle(
  input: Readonly<{ controller: FleetController; filters: FleetVehicleFilters }>,
): Promise<FleetVehiclePage> {
  const items: FleetVehicleDetail[] = []
  let cursor: null | string = null

  do {
    const page: FleetVehiclePage = await input.controller.listVehicles({
      cursor,
      filters: input.filters,
      limit: FLEET_PAGE_SIZE,
    })
    items.push(...page.items)
    cursor = page.nextCursor
  } while (cursor !== null && items.length < FLEET_VEHICLE_LOAD_LIMIT)

  return { items, nextCursor: null }
}

function useFleetQueries(
  input: Readonly<{
    controller: FleetController
    directoryKey: FleetQueryKey
    driverFilters: FleetDriverFilters
    driversKey: FleetQueryKey
    vehicleFilters: FleetVehicleFilters
    vehiclesKey: FleetQueryKey
  }>,
) {
  const vehiclesQuery = useQuery({
    enabled: input.controller.canReadFleet,
    queryFn: () =>
      loadEveryVehicle({ controller: input.controller, filters: input.vehicleFilters }),
    queryKey: input.vehiclesKey,
  })
  const driversQuery = useQuery({
    enabled: input.controller.canReadFleet,
    queryFn: () => loadEveryDriver({ controller: input.controller, filters: input.driverFilters }),
    queryKey: input.driversKey,
  })
  /**
   * O formulário de veículo escolhe o proprietário na lista inteira: o filtro da aba Motoristas
   * recortaria justo o motorista que falta completar. Sem filtro ativo a chave é a mesma da aba, e
   * o React Query serve as duas com uma requisição só.
   */
  const directoryQuery = useQuery({
    enabled: input.controller.canReadFleet,
    queryFn: () => loadEveryDriver({ controller: input.controller, filters: {} }),
    queryKey: input.directoryKey,
  })
  return { directoryQuery, driversQuery, vehiclesQuery }
}

function useFleetMutations(
  input: Readonly<{
    companyId?: string
    controller: FleetController
    vehiclesKey: FleetQueryKey
  }>,
) {
  const queryClient = useQueryClient()
  const invalidateVehicles = () => queryClient.invalidateQueries({ queryKey: input.vehiclesKey })
  /** Prefixo, não chave exata: a aba filtrada e o diretório do formulário são duas entradas do cache. */
  const invalidateDrivers = () =>
    queryClient.invalidateQueries({ queryKey: [FLEET_DRIVERS_QUERY_KEY, input.companyId] })

  return {
    createDriverMutation: useMutation({
      mutationFn: input.controller.createDriver,
      onSuccess: invalidateDrivers,
    }),
    createVehicleMutation: useMutation({
      mutationFn: input.controller.createVehicle,
      onSuccess: invalidateVehicles,
    }),
    updateDriverMutation: useMutation({
      mutationFn: input.controller.updateDriver,
      onSuccess: invalidateDrivers,
    }),
    updateVehicleMutation: useMutation({
      mutationFn: input.controller.updateVehicle,
      onSuccess: invalidateVehicles,
    }),
  }
}

function resolveQueryStatus(
  input: Readonly<{ isError: boolean; isPending: boolean }>,
): 'error' | 'loading' | 'success' {
  if (input.isError) return 'error'
  if (input.isPending) return 'loading'
  return 'success'
}

export function useFleet(
  input: Readonly<{
    companyId?: string
    driverFilters?: FleetDriverFilters
    permissions: readonly string[]
    vehicleFilters?: FleetVehicleFilters
  }>,
): ReturnType<typeof useFleetMutations> & Readonly<{ viewModel: FleetViewModel }> {
  const driverFilters = input.driverFilters ?? {}
  const vehicleFilters = input.vehicleFilters ?? {}
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createFleetController({ client: getFleetClient(), permissions })
  const vehiclesKey = [
    FLEET_VEHICLES_QUERY_KEY,
    input.companyId,
    JSON.stringify(vehicleFilters),
  ] as const
  const driversKey = [
    FLEET_DRIVERS_QUERY_KEY,
    input.companyId,
    JSON.stringify(driverFilters),
  ] as const
  const directoryKey = [FLEET_DRIVERS_QUERY_KEY, input.companyId, JSON.stringify({})] as const
  const queries = useFleetQueries({
    controller,
    directoryKey,
    driverFilters,
    driversKey,
    vehicleFilters,
    vehiclesKey,
  })
  const mutations = useFleetMutations({
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    controller,
    vehiclesKey,
  })
  const viewModel = createFleetViewModel({
    ...(queries.directoryQuery.data === undefined
      ? {}
      : { driverDirectory: queries.directoryQuery.data }),
    ...(queries.driversQuery.data === undefined ? {} : { drivers: queries.driversQuery.data }),
    ...(queries.vehiclesQuery.data === undefined ? {} : { vehicles: queries.vehiclesQuery.data }),
    permissions,
    status: resolveQueryStatus({
      isError: queries.vehiclesQuery.isError || queries.driversQuery.isError,
      isPending: queries.vehiclesQuery.isPending || queries.driversQuery.isPending,
    }),
  })

  return { ...mutations, viewModel }
}
