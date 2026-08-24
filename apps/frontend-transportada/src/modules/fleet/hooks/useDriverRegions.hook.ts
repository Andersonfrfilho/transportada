/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { FleetDriverCoverage } from '../shared/driverCoverage.service'
import type { FleetReplaceDriverRegionsInput } from '../shared/fleet.types'
import type { FreightRegion } from '../shared/freightRegion.types'
import { createFleetController, getFleetClient } from './useFleet.hook'
import { loadEveryFreightRegion } from './useFreightRegions.hook'

const FLEET_DRIVER_REGIONS_QUERY_KEY = 'fleet-driver-regions'
const FLEET_REGION_OPTIONS_QUERY_KEY = 'fleet-region-options'

export type DriverRegionsController = Readonly<{
  coverage: readonly FleetDriverCoverage[]
  isLoading: boolean
  regions: readonly FreightRegion[]
  replace: (input: FleetReplaceDriverRegionsInput) => Promise<readonly FleetDriverCoverage[]>
}>

/**
 * As rotas do formulário são as ativas: a rota que saiu da tabela do cliente não pode voltar a ser
 * oferecida, mas a cobertura já gravada continua chegando pela consulta do motorista.
 */
export function useDriverRegions(
  input: Readonly<{
    companyId?: string
    driverId?: string
    permissions: readonly string[]
  }>,
): DriverRegionsController {
  const queryClient = useQueryClient()
  const permissions = input.companyId === undefined ? [] : input.permissions
  const client = getFleetClient()
  const controller = createFleetController({ client, permissions })
  const { driverId } = input
  const coverageKey = [FLEET_DRIVER_REGIONS_QUERY_KEY, input.companyId, driverId] as const
  const optionsKey = [FLEET_REGION_OPTIONS_QUERY_KEY, input.companyId] as const
  /** Pelo mesmo motivo do vínculo de veículos: a ficha do veículo grava por outro motorista. */
  const coverageScopeKey = [FLEET_DRIVER_REGIONS_QUERY_KEY, input.companyId] as const

  const coverageQuery = useQuery({
    enabled: controller.canReadFleet && driverId !== undefined,
    queryFn: () => controller.listDriverRegions({ driverId: driverId ?? '' }),
    queryKey: coverageKey,
  })
  const optionsQuery = useQuery({
    enabled: controller.canReadFleet,
    queryFn: () =>
      loadEveryFreightRegion((page) =>
        client.listFreightRegions({ ...page, filters: { statusEq: 'active' } }),
      ),
    queryKey: optionsKey,
  })
  const replaceMutation = useMutation({
    mutationFn: controller.replaceDriverRegions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: coverageScopeKey }),
  })

  return {
    coverage: coverageQuery.data ?? [],
    isLoading: optionsQuery.isLoading,
    regions: optionsQuery.data ?? [],
    replace: (body) => replaceMutation.mutateAsync(body),
  }
}
