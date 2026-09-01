/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import { checkTripAcceptsLinkage } from '../domain/trip-state.policy.js'
import {
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
  TripStopSetMismatchError,
} from '../domain/trip.error.js'

export type ReorderTripStopsPreconditions = {
  readonly stopIds: readonly string[]
  readonly tripStatus: TripStatus
}

export type ReorderTripStopsPort = {
  readStopOrderPreconditions(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<ReorderTripStopsPreconditions | null>
  reorderStops(input: {
    readonly companyId: string
    readonly orderedStopIds: readonly string[]
    readonly tripId: string
  }): Promise<void>
}

export type ReorderTripStopsInput = {
  readonly companyId: string
  readonly orderedStopIds: readonly string[]
  readonly repository: ReorderTripStopsPort
  readonly tripId: string
}

export type ReorderTripStopsResult = {
  readonly tripStatus: TripStatus
}

/**
 * ADR-0043 §2/§3, RF-6: reordenar parada é a mesma porta de não-retorno de vincular/desvincular
 * nota — a partir de `dispatched`, o `trip_stop_snapshot` (T005) é o que manda, e a ordem editável
 * não existe mais. `checkTripAcceptsLinkage` já é essa regra; reaproveitada aqui em vez de uma
 * cópia.
 *
 * A lista recebida tem de ser exatamente o conjunto de paradas da viagem — nem uma a mais (id de
 * outra viagem, id inventado), nem uma a menos (perderia parada da sequência sem avisar).
 */
export async function reorderTripStops(
  input: ReorderTripStopsInput,
): Promise<ReorderTripStopsResult> {
  const { companyId, orderedStopIds, repository, tripId } = input
  const preconditions = await repository.readStopOrderPreconditions({ companyId, tripId })
  if (preconditions === null) throw new TripNotFoundError()

  const reason = checkTripAcceptsLinkage(preconditions.tripStatus)
  if (reason !== null) throw new TripStateTransitionNotAllowedError(reason)

  const currentStopIds = new Set(preconditions.stopIds)
  const requestedStopIds = new Set(orderedStopIds)
  const isSameSet =
    currentStopIds.size === requestedStopIds.size &&
    orderedStopIds.length === requestedStopIds.size &&
    [...currentStopIds].every((stopId) => requestedStopIds.has(stopId))
  if (!isSameSet) throw new TripStopSetMismatchError()

  await repository.reorderStops({ companyId, orderedStopIds, tripId })
  return { tripStatus: preconditions.tripStatus }
}
