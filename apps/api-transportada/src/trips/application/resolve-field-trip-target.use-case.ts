/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { pickOnBehalfOfDriver } from '../domain/field-trip-target.policy.js'
import { TripNotFoundError } from '../domain/trip.error.js'
import type { FieldTripTargetPort } from './field-trip-target.port.js'
import {
  FIELD_TRIP_TARGET_KIND,
  type ResolvedTripFieldTarget,
  type TripFieldTripTarget,
} from './field-trip-target.types.js'

export type ResolveFieldTripTargetParams = {
  readonly companyId: string
  readonly repository: FieldTripTargetPort
  readonly target: TripFieldTripTarget
}

export type ResolveFieldTripTargetResult = ResolvedTripFieldTarget

/**
 * ADR-0067 §1–2: o escritório acha a viagem pela empresa do contexto, nunca pelo motorista, e
 * descobre em nome de quem registra. Viagem de outra empresa responde igual à inexistente.
 */
export async function resolveFieldTripTarget(
  params: ResolveFieldTripTargetParams,
): Promise<ResolveFieldTripTargetResult> {
  const crew = await params.repository.findTripCrew({
    companyId: params.companyId,
    tripId: params.target.tripId,
  })
  if (crew === null) throw new TripNotFoundError()

  const onBehalfOfDriverId = pickOnBehalfOfDriver(
    params.target.driverId === undefined
      ? { drivers: crew.drivers }
      : { drivers: crew.drivers, requestedDriverId: params.target.driverId },
  )

  // O único lugar que põe a marca: é o que torna o alvo resolvido impossível de forjar.
  return {
    kind: FIELD_TRIP_TARGET_KIND.trip,
    onBehalfOfDriverId,
    tripId: crew.tripId,
    tripStatus: crew.tripStatus,
  } as ResolvedTripFieldTarget
}
