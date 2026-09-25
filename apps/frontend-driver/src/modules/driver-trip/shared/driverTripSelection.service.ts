/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip } from './driverTrip.types'

/**
 * ADR-0075 §8: "em rota" para escolher a viagem padrão. `dispatched` fica de fora de propósito — a
 * carga saiu, mas o motorista ainda não marcou nada, e quem já está entregando é a que importa.
 */
const ON_ROUTE_TRIP_STATUSES: ReadonlySet<string> = new Set(['in_transit', 'on_delivery_route'])

export type ResolveSelectedTripParams = Readonly<{
  selectedTripId: string | undefined
  /** Na ordem da API: `createdAt` ascendente, então a primeira é a mais antiga. */
  trips: readonly DriverTrip[]
}>

/**
 * RF12: a escolha do motorista vale enquanto a viagem continuar na lista. Sem escolha, ou com a
 * escolhida fora da lista (fechou, saiu dele), vale a padrão: a mais antiga em rota, senão a mais
 * antiga de todas.
 */
export function resolveSelectedTrip({
  selectedTripId,
  trips,
}: ResolveSelectedTripParams): DriverTrip | undefined {
  const chosen = trips.find((trip) => trip.id === selectedTripId)
  if (chosen !== undefined) return chosen

  return trips.find((trip) => ON_ROUTE_TRIP_STATUSES.has(trip.status)) ?? trips[0]
}
