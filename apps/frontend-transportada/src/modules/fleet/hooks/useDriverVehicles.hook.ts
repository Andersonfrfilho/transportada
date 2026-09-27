/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { appendDriverVehicle } from '../shared/driverVehicles.service'
import {
  FLEET_VEHICLE_OPTIONS_PAGE_SIZE,
  FLEET_VEHICLE_OPTIONS_QUERY_KEY,
} from '../shared/fleet.constant'
import type {
  FleetDriverVehicleLink,
  FleetReplaceDriverVehiclesInput,
  FleetVehicleDetail,
} from '../shared/fleet.types'
import { createFleetController, getFleetClient } from './useFleet.hook'

const FLEET_DRIVER_VEHICLES_QUERY_KEY = 'fleet-driver-vehicles'

export type DriverVehiclesController = Readonly<{
  /**
   * Vínculo carregado é o que autoriza reescrever a lista: gravar a ficha antes da resposta
   * mandaria uma seleção vazia, e a API leria isso como "solte todos os veículos deste motorista".
   */
  isReady: boolean
  links: readonly FleetDriverVehicleLink[]
  /** Soma um veículo aos que o motorista já dirige, sem soltar nenhum dos outros. */
  linkVehicle: (input: LinkDriverVehicleInput) => Promise<void>
  options: readonly FleetVehicleDetail[]
  replace: (input: FleetReplaceDriverVehiclesInput) => Promise<readonly FleetDriverVehicleLink[]>
}>

export type LinkDriverVehicleInput = Readonly<{ driverId: string; vehicleId: string }>

/**
 * A lista de opções tem chave própria: os filtros da aba de veículos não podem esconder um
 * veículo que o motorista já dirige.
 */
export function useDriverVehicles(
  input: Readonly<{
    companyId?: string
    driverId?: string
    permissions: readonly string[]
  }>,
): DriverVehiclesController {
  const queryClient = useQueryClient()
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createFleetController({ client: getFleetClient(), permissions })
  const { driverId } = input
  const linksKey = [FLEET_DRIVER_VEHICLES_QUERY_KEY, input.companyId, driverId] as const
  /**
   * A gravação nem sempre é do motorista aberto aqui: a ficha que nasce dentro do veículo grava
   * para um motorista que esta instância não conhece. Invalidar pelo prefixo alcança os dois.
   */
  const linksScopeKey = [FLEET_DRIVER_VEHICLES_QUERY_KEY, input.companyId] as const
  const optionsKey = [FLEET_VEHICLE_OPTIONS_QUERY_KEY, input.companyId] as const

  const linksQuery = useQuery({
    enabled: controller.canReadFleet && driverId !== undefined,
    queryFn: () => controller.listDriverVehicles({ driverId: driverId ?? '' }),
    queryKey: linksKey,
  })
  const optionsQuery = useQuery({
    enabled: controller.canReadFleet,
    queryFn: () =>
      controller.listVehicles({
        cursor: null,
        filters: { statusEq: 'active' },
        limit: FLEET_VEHICLE_OPTIONS_PAGE_SIZE,
      }),
    queryKey: optionsKey,
  })
  const replaceMutation = useMutation({
    mutationFn: controller.replaceDriverVehicles,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: linksScopeKey }),
  })

  /**
   * A lista vem do servidor na hora, nunca do cache: a troca é da lista inteira, e uma cópia velha
   * soltaria o veículo que outra tela vinculou nesse meio-tempo.
   */
  async function linkVehicle(link: LinkDriverVehicleInput): Promise<void> {
    const links = await queryClient.fetchQuery({
      queryFn: () => controller.listDriverVehicles({ driverId: link.driverId }),
      queryKey: [FLEET_DRIVER_VEHICLES_QUERY_KEY, input.companyId, link.driverId],
      staleTime: 0,
    })
    const vehicleIds = appendDriverVehicle({ links, vehicleId: link.vehicleId })
    if (vehicleIds === undefined) return
    await replaceMutation.mutateAsync({ driverId: link.driverId, vehicleIds })
  }

  return {
    isReady: driverId === undefined || linksQuery.isFetched,
    links: linksQuery.data ?? [],
    linkVehicle,
    options: optionsQuery.data?.items ?? [],
    replace: (body) => replaceMutation.mutateAsync(body),
  }
}
