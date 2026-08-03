/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FleetDriverVehicleLink } from './fleet.types'

export function toSelectedVehicleIds(links: readonly FleetDriverVehicleLink[]): readonly string[] {
  return links.map((link) => link.vehicle.id)
}

export function toOwnedVehicleIds(links: readonly FleetDriverVehicleLink[]): readonly string[] {
  return links.filter((link) => link.ownedByDriver).map((link) => link.vehicle.id)
}

export function toggleVehicleSelection(
  input: Readonly<{ selected: readonly string[]; vehicleId: string }>,
): readonly string[] {
  if (input.selected.includes(input.vehicleId)) {
    return input.selected.filter((vehicleId) => vehicleId !== input.vehicleId)
  }
  return [...input.selected, input.vehicleId]
}
