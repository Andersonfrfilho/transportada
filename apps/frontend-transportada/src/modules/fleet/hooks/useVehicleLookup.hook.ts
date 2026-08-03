/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import type { FleetVehicleLookup } from '../shared/fleet.types'
import { createFleetController, getFleetClient } from './useFleet.hook'

const FLEET_CAPABILITIES_QUERY_KEY = 'fleet-capabilities'

export type VehicleLookupController = Readonly<{
  canLookupPlate: boolean
  lookup: (plate: string) => Promise<FleetVehicleLookup | null>
}>

export function useVehicleLookup(
  input: Readonly<{ companyId?: string; permissions: readonly string[] }>,
): VehicleLookupController {
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createFleetController({ client: getFleetClient(), permissions })
  const capabilitiesQuery = useQuery({
    enabled: controller.canManageFleet,
    queryFn: () => controller.getFleetCapabilities(),
    queryKey: [FLEET_CAPABILITIES_QUERY_KEY, input.companyId],
  })

  return {
    canLookupPlate: controller.canManageFleet && (capabilitiesQuery.data?.vehicleLookup ?? false),
    lookup: (plate) => controller.lookupVehicleByPlate({ plate }),
  }
}
