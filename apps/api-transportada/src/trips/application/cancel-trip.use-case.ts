/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import { TRIP_ACTION, checkTripTransition } from '../domain/trip-state.policy.js'
import { TripNotFoundError, TripStateTransitionNotAllowedError } from '../domain/trip.error.js'

export type CancelTripPort = {
  markCancelled(input: { readonly companyId: string; readonly tripId: string }): Promise<TripStatus>
  readTripStatus(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus | null>
}

export type CancelTripInput = {
  readonly companyId: string
  readonly repository: CancelTripPort
  readonly tripId: string
}

export type CancelTripResult = { readonly tripStatus: TripStatus }

/**
 * ADR-0043 §1, §2: cancelar vale até com o motorista na rua — é incidente, não fluxo — mas nunca
 * depois de `completed`. Idempotente: cancelar uma viagem já cancelada não escreve de novo.
 */
export async function cancelTrip(input: CancelTripInput): Promise<CancelTripResult> {
  const tripStatus = await input.repository.readTripStatus(input)
  if (tripStatus === null) throw new TripNotFoundError()

  // `hasRoute` não entra na decisão de cancelar (checkTripTransition ignora o campo para esta
  // ação) — cancelar não exige rota nenhuma.
  const transition = checkTripTransition({
    action: TRIP_ACTION.cancel,
    hasRoute: false,
    tripStatus,
  })

  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }
  if (transition.outcome === 'unchanged') return { tripStatus }

  const nextStatus = await input.repository.markCancelled(input)
  return { tripStatus: nextStatus }
}
