/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { FleetVehicleLookupUnavailableError } from '../domain/fleet.error.js'
import type {
  FleetCompanyContext,
  FleetVehicleLookup,
  FleetVehicleLookupPort,
} from './fleet.port.js'

export type LookupFleetVehicleInput = {
  readonly context: FleetCompanyContext
  readonly plate: string
}

export type FleetVehicleLookupUseCase = {
  isAvailable(): boolean
  lookup(input: LookupFleetVehicleInput): Promise<FleetVehicleLookup | null>
}

export function createFleetVehicleLookupUseCase(dependencies: {
  readonly gateway: FleetVehicleLookupPort | null
}): FleetVehicleLookupUseCase {
  return {
    isAvailable: (): boolean => dependencies.gateway !== null,
    async lookup(input: LookupFleetVehicleInput): Promise<FleetVehicleLookup | null> {
      if (dependencies.gateway === null) throw new FleetVehicleLookupUnavailableError()
      return dependencies.gateway.lookupByPlate({ plate: input.plate.trim().toUpperCase() })
    },
  }
}
