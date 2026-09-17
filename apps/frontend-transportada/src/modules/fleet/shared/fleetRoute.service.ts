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
/**
 * RF7 (spec 154): a praça sem tarifa conhecida no extrato do pedágio da rota abre a aba de pedágio
 * já com a busca preenchida — o parâmetro fica sempre presente na URL (mesmo vazio, quando a praça
 * não tem nome nem operador) para abrir a aba certa mesmo sem termo para pré-preencher.
 */
export const FLEET_TOLL_BOOTH_PARAMETER = 'tollBoothSearch'

export function buildFleetDriverRoute(driverId: string): string {
  return `${FLEET_ROUTE}?${new URLSearchParams({ [FLEET_DRIVER_PARAMETER]: driverId }).toString()}`
}

export function buildFleetVehicleRoute(vehicleId: string): string {
  return `${FLEET_ROUTE}?${new URLSearchParams({ [FLEET_VEHICLE_PARAMETER]: vehicleId }).toString()}`
}

export function buildFleetTollBoothRoute(search: string): string {
  return `${FLEET_ROUTE}?${new URLSearchParams({ [FLEET_TOLL_BOOTH_PARAMETER]: search }).toString()}`
}

export function parseFleetDriverParameter(search: string): null | string {
  return readParameter(search, FLEET_DRIVER_PARAMETER)
}

export function parseFleetVehicleParameter(search: string): null | string {
  return readParameter(search, FLEET_VEHICLE_PARAMETER)
}

/** Termo pré-preenchido — `null` quando a praça de origem não tinha nome nem operador. */
export function parseFleetTollBoothSearchParameter(search: string): null | string {
  return readParameter(search, FLEET_TOLL_BOOTH_PARAMETER)
}

/** Presença do parâmetro, distinta do valor: decide a aba mesmo quando o termo veio vazio. */
export function hasFleetTollBoothParameter(search: string): boolean {
  return new URLSearchParams(search).has(FLEET_TOLL_BOOTH_PARAMETER)
}

function readParameter(search: string, name: string): null | string {
  const value = new URLSearchParams(search).get(name)
  return value === null || value === '' ? null : value
}
