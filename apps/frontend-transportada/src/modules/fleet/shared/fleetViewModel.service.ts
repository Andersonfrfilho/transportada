/* Copyright (c) 2026 Ada Technology. MIT License. */
import { FLEET_MANAGE_PERMISSION, FLEET_READ_PERMISSION } from './fleet.constant'
import type {
  FleetDriverDetail,
  FleetDriverPage,
  FleetVehicleDetail,
  FleetVehiclePage,
} from './fleet.types'

export type FleetQueryStatus = 'error' | 'loading' | 'success'

export type FleetViewStatus = 'empty' | 'error' | 'forbidden' | 'loading' | 'ready'

export type FleetViewModel = Readonly<{
  canManageFleet: boolean
  canReadFleet: boolean
  drivers?: readonly FleetDriverDetail[]
  nextDriverCursor?: null | string
  nextVehicleCursor?: null | string
  status: FleetViewStatus
  vehicles?: readonly FleetVehicleDetail[]
}>

type ViewModelInput = Readonly<{
  drivers?: FleetDriverPage
  permissions: readonly string[]
  status: FleetQueryStatus
  vehicles?: FleetVehiclePage
}>

export function createFleetViewModel(input: ViewModelInput): FleetViewModel {
  const canReadFleet = input.permissions.includes(FLEET_READ_PERMISSION)
  const canManageFleet = input.permissions.includes(FLEET_MANAGE_PERMISSION)
  const permissionsView = { canManageFleet, canReadFleet }

  if (!canReadFleet) return { ...permissionsView, status: 'forbidden' }
  if (input.status === 'error') return { ...permissionsView, status: 'error' }
  if (input.status === 'loading' || input.vehicles === undefined || input.drivers === undefined) {
    return { ...permissionsView, status: 'loading' }
  }
  if (input.vehicles.items.length === 0 && input.drivers.items.length === 0) {
    return { ...permissionsView, status: 'empty' }
  }

  return {
    ...permissionsView,
    drivers: input.drivers.items,
    nextDriverCursor: input.drivers.nextCursor,
    nextVehicleCursor: input.vehicles.nextCursor,
    status: 'ready',
    vehicles: input.vehicles.items,
  }
}
