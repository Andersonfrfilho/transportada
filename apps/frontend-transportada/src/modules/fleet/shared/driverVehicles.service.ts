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

/**
 * Vínculo é histórico, e reescrevê-lo é uma decisão: gravar a ficha com a lista ainda em branco
 * porque a resposta não chegou soltaria todos os veículos que o motorista já dirige.
 */
export function shouldReplaceDriverVehicles(
  input: Readonly<{ isReady: boolean; hasOperatorChoice: boolean }>,
): boolean {
  return input.hasOperatorChoice || input.isReady
}

/**
 * A API só troca a lista inteira: somar um veículo é reenviar os atuais mais ele. Já vinculado,
 * não há o que gravar — reenviar a mesma lista seria uma escrita sem efeito.
 */
export function appendDriverVehicle(
  input: Readonly<{ links: readonly FleetDriverVehicleLink[]; vehicleId: string }>,
): readonly string[] | undefined {
  const current = toSelectedVehicleIds(input.links)
  if (current.includes(input.vehicleId)) return undefined
  return [...current, input.vehicleId]
}
