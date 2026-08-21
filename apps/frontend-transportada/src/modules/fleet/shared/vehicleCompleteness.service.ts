/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FleetVehicleBody } from './fleet.types'

export function isVehicleIncompleteForMdfe(vehicle: FleetVehicleBody): boolean {
  return vehicle.role === 'traction' && vehicle.vehicleType === ''
}
