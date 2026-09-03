import { useQuery } from '@tanstack/react-query'

import { FLEET_DRIVER_OPTIONS_PAGE_SIZE } from '../shared/fleet.constant'
import type { FleetDriverDetail, FleetDriverVehiclePair } from '../shared/fleet.types'
import { createFleetController, getFleetClient } from './useFleet.hook'

const FLEET_DRIVER_VEHICLE_PAIRS_QUERY_KEY = 'fleet-driver-vehicle-pairs'
const FLEET_DRIVER_OPTIONS_QUERY_KEY = 'fleet-driver-options'

export type DriverPairingController = Readonly<{
  drivers: readonly FleetDriverDetail[]
  links: readonly FleetDriverVehiclePair[]
}>

/**
 * Spec 081: o que o pareamento da sugestão multi-veículo precisa saber — quem existe e quem está
 * amarrado a quem. As duas consultas têm chave própria pelo mesmo motivo da lista de veículos do
 * vínculo: os filtros da aba de motoristas não podem esconder quem já dirige um caminhão.
 */
export function useDriverVehiclePairs(
  input: Readonly<{
    companyId?: string
    enabled?: boolean
    permissions: readonly string[]
  }>,
): DriverPairingController {
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createFleetController({ client: getFleetClient(), permissions })
  const enabled = controller.canReadFleet && (input.enabled ?? true)

  const linksQuery = useQuery({
    enabled,
    queryFn: () => controller.listDriverVehiclePairs(),
    queryKey: [FLEET_DRIVER_VEHICLE_PAIRS_QUERY_KEY, input.companyId] as const,
  })
  const driversQuery = useQuery({
    enabled,
    queryFn: () =>
      controller.listDrivers({
        cursor: null,
        filters: { statusEq: 'active' },
        limit: FLEET_DRIVER_OPTIONS_PAGE_SIZE,
      }),
    queryKey: [FLEET_DRIVER_OPTIONS_QUERY_KEY, input.companyId] as const,
  })

  return { drivers: driversQuery.data?.items ?? [], links: linksQuery.data ?? [] }
}
