/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { FLEET_DRIVER_OPTIONS_PAGE_SIZE } from '../shared/fleet.constant'
import { createFleetController, getFleetClient } from './useFleet.hook'

const DRIVER_OPTIONS_QUERY_KEY = 'fleet-driver-options'

export type DriverOption = Readonly<{ id: string; name: string }>

export type DriverOptionsController = Readonly<{
  canReadDrivers: boolean
  drivers: readonly DriverOption[]
  nameOf: (driverId: string) => string | undefined
}>

/**
 * Quem pode pagar um acerto de ocorrência, pelo **nome**. Pedir o UUID do motorista digitado à mão
 * (revisão de design da T30, B3) grava a dívida no motorista errado com um dígito trocado, e sem
 * aviso nenhum — o id não tem como ser conferido a olho.
 *
 * Sem `fleet.read` a consulta nem sai: a lista é do módulo de frota, e a permissão é dele.
 */
export function useDriverOptions(
  input: Readonly<{ enabled?: boolean; permissions: readonly string[] }>,
): DriverOptionsController {
  const controller = createFleetController({
    client: getFleetClient(),
    permissions: input.permissions,
  })
  const query = useQuery({
    enabled: controller.canReadFleet && (input.enabled ?? true),
    queryFn: () =>
      controller.listDrivers({
        cursor: null,
        filters: { statusEq: 'active' },
        limit: FLEET_DRIVER_OPTIONS_PAGE_SIZE,
      }),
    queryKey: [DRIVER_OPTIONS_QUERY_KEY] as const,
  })
  const drivers = (query.data?.items ?? []).map((driver) => ({ id: driver.id, name: driver.name }))

  return {
    canReadDrivers: controller.canReadFleet,
    drivers,
    nameOf: (driverId) => drivers.find((driver) => driver.id === driverId)?.name,
  }
}
