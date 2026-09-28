/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isConcludedTripStatus } from './tripSnapshot.service'
import type { DriverTrip } from './driverTrip.types'

/**
 * Spec 217 (RF8, D6): a troca de motorista, e a troca de veículo que devolve a viagem para
 * `draft`, tiram a viagem de `GET /me/trips/current` sem nenhum campo novo no contrato — a
 * ausência já é o sinal. Compara o snapshot local com a resposta nova: viagem que estava lá, não
 * veio agora e não terminou (`completed`/`cancelled`, o caminho normal) deixou de ser do motorista.
 */
export type DetectTripReassignmentParams = Readonly<{
  currentTrips: readonly DriverTrip[]
  previousTrips: readonly DriverTrip[]
}>

export function hasReassignedTrip({
  currentTrips,
  previousTrips,
}: DetectTripReassignmentParams): boolean {
  const currentTripIds = new Set(currentTrips.map((trip) => trip.id))
  return previousTrips.some(
    (trip) => !currentTripIds.has(trip.id) && !isConcludedTripStatus(trip.status),
  )
}
