/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripCrewMember } from './trip-driver-cost.policy.js'

export type OrderTripCrewResult = Readonly<{
  crew: readonly TripCrewMember[]
  /** Os ids pedidos que o banco não respondeu — desconhecidos, ou de outra empresa. */
  missingDriverIds: readonly string[]
}>

/**
 * A tripulação da prévia, na ordem em que o formulário a pediu, e o que ficou pelo caminho.
 *
 * ⚠️ `IN (...)` não promete ordem nenhuma. A lista vira `basis.crew[]`, que é o que a tela imprime
 * e o que o congelamento guarda: sem ordenar, duas leituras iguais da mesma prévia podiam trocar os
 * motoristas de lugar. A ordem do pedido é também a que `trip_drivers.position` vai gravar quando a
 * viagem nascer — a prévia e a viagem passam a contar a mesma história.
 *
 * O id que o banco não respondeu **não é erro desta função**: o filtro por empresa que o descartou
 * é a defesa de tenant funcionando. Mas o sumiço precisa ter nome, porque a margem sai menor com um
 * motorista a menos e nada mais no caminho registraria a diferença.
 */
export function orderCrewByRequest(input: {
  readonly crew: readonly TripCrewMember[]
  readonly driverIds: readonly string[]
}): OrderTripCrewResult {
  const byDriverId = new Map(input.crew.map((member) => [member.driverId, member]))
  const seenDriverIds = new Set<string>()
  const crew: TripCrewMember[] = []
  const missingDriverIds: string[] = []

  for (const driverId of input.driverIds) {
    /** O mesmo id duas vezes no formulário é um motorista só: repetir pagaria a diária em dobro. */
    if (seenDriverIds.has(driverId)) continue
    seenDriverIds.add(driverId)

    const member = byDriverId.get(driverId)
    if (member === undefined) missingDriverIds.push(driverId)
    else crew.push(member)
  }

  return { crew, missingDriverIds }
}
