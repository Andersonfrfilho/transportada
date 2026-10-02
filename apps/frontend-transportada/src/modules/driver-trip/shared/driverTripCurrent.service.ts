/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip, DriverTripSnapshot } from './driverTrip.types'

/**
 * ⚠️ Cópia por valor de `isConcludedTripStatus` do `frontend-driver` (ADR-0075 §7) — o bundle não
 * carrega código de outra app. Spec 224: a API devolve a viagem concluída/cancelada por 15 min,
 * só para o aviso de reatribuição do app do motorista; esta cópia legada nunca a exibe como ativa.
 */
const CONCLUDED_TRIP_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled'])

export function isConcludedTripStatus(status: string): boolean {
  return CONCLUDED_TRIP_STATUSES.has(status)
}

/** A viagem da tela e do Perfil: a primeira da lista que ainda não terminou. */
export function findCurrentDriverTrip(
  snapshot: DriverTripSnapshot | undefined,
): DriverTrip | undefined {
  return snapshot?.trips.find((trip) => !isConcludedTripStatus(trip.status))
}
