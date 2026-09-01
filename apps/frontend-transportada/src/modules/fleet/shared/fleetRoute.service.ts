/* Copyright (c) 2026 Ada Technology. MIT License. */
export const FLEET_ROUTE = '/fleet'

/**
 * A navegação do shell é manual (`main.tsx`) e o registro a abrir viaja na query string: o
 * `pathname` continua `/fleet`, então `resolveCurrentWorkspace` não muda de comportamento.
 *
 * Motorista e veículo são parâmetros separados porque abrem abas diferentes da frota — um só
 * parâmetro obrigaria quem lê a adivinhar de que tipo é o id.
 */
export const FLEET_DRIVER_PARAMETER = 'driverId'
export const FLEET_VEHICLE_PARAMETER = 'vehicleId'

export function buildFleetDriverRoute(driverId: string): string {
  return `${FLEET_ROUTE}?${new URLSearchParams({ [FLEET_DRIVER_PARAMETER]: driverId }).toString()}`
}

export function buildFleetVehicleRoute(vehicleId: string): string {
  return `${FLEET_ROUTE}?${new URLSearchParams({ [FLEET_VEHICLE_PARAMETER]: vehicleId }).toString()}`
}

export function parseFleetDriverParameter(search: string): null | string {
  return readParameter(search, FLEET_DRIVER_PARAMETER)
}

export function parseFleetVehicleParameter(search: string): null | string {
  return readParameter(search, FLEET_VEHICLE_PARAMETER)
}

function readParameter(search: string, name: string): null | string {
  const value = new URLSearchParams(search).get(name)
  return value === null || value === '' ? null : value
}
