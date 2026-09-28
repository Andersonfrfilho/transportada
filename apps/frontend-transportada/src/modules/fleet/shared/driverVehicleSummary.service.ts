/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FleetDriverVehiclePair, FleetVehicleDetail } from './fleet.types'

export type FleetDriverVehicleSummary = Readonly<{ id: string; plate: string }>

/**
 * A tabela de motoristas mostra quem dirige o quê sem abrir a ficha de cada um — o pareamento
 * (spec 081) já existe para a sugestão multi-veículo, e a placa vem de juntar com a lista de
 * veículos já carregada pela aba Veículos. Motorista sem vínculo simplesmente não entra no mapa.
 */
export function buildDriverVehicleSummaries(
  input: Readonly<{
    pairs: readonly FleetDriverVehiclePair[]
    vehicles: readonly FleetVehicleDetail[]
  }>,
): ReadonlyMap<string, readonly FleetDriverVehicleSummary[]> {
  const vehicleById = new Map(input.vehicles.map((vehicle) => [vehicle.id, vehicle]))
  const summariesByDriverId = new Map<string, FleetDriverVehicleSummary[]>()

  for (const pair of input.pairs) {
    const vehicle = vehicleById.get(pair.vehicleId)
    if (vehicle === undefined) continue

    const summaries = summariesByDriverId.get(pair.driverId) ?? []
    summaries.push({ id: vehicle.id, plate: vehicle.plate })
    summariesByDriverId.set(pair.driverId, summaries)
  }

  return summariesByDriverId
}
