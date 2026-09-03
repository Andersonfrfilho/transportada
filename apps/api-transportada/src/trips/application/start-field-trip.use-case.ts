/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import { TRIP_ACTION, checkTripTransition } from '../domain/trip-state.policy.js'
import { TripNotFoundError, TripStateTransitionNotAllowedError } from '../domain/trip.error.js'

/** Os dois toques do campo (ADR-0058). O escritório não os alcança: `dispatch` continua dele. */
export const FIELD_TRIP_STEP = {
  confirmLoad: 'confirmLoad',
  startRoute: 'startRoute',
} as const

export type FieldTripStep = (typeof FIELD_TRIP_STEP)[keyof typeof FIELD_TRIP_STEP]

export type StartFieldTripPort = {
  /** `null` quando o motorista não tem viagem na rua — a mesma ausência de `/me/trips/current`. */
  readCurrent(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<{ readonly tripId: string; readonly tripStatus: TripStatus } | null>
  updateStatus(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly tripId: string
    readonly tripStatus: TripStatus
  }): Promise<void>
}

export type StartFieldTripInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly driverId: string
  readonly repository: StartFieldTripPort
  readonly step: FieldTripStep
}

export type StartFieldTripResult = {
  /** `false` quando o toque se repetiu — a rede do pátio cai e o motorista toca de novo. */
  readonly changed: boolean
  readonly tripId: string
  readonly tripStatus: TripStatus
}

/**
 * ADR-0058: o começo da viagem é toque do motorista, e o fim continua derivado.
 *
 * **Não recebe id de viagem** (ADR-0045 §2): o servidor resolve pelo vínculo do motorista, como toda
 * rota sob `/me/trips/current`. Quem não escolhe id não enumera.
 *
 * Repetir converge em `changed: false`, nunca em erro: a fila offline drena muito depois do toque, e
 * um toque que **funcionou** voltando como conflito puniria quem fez tudo certo.
 */
export async function startFieldTrip(input: StartFieldTripInput): Promise<StartFieldTripResult> {
  const current = await input.repository.readCurrent({
    companyId: input.companyId,
    driverId: input.driverId,
  })
  if (current === null) throw new TripNotFoundError()

  const transition = checkTripTransition({
    action: TRIP_ACTION[input.step],
    /* A viagem já saiu do barracão: o roteiro congelou no despacho, e não há o que replanejar. */
    hasRoute: true,
    tripStatus: current.tripStatus,
  })

  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }
  if (transition.outcome === 'unchanged') {
    return { changed: false, tripId: current.tripId, tripStatus: current.tripStatus }
  }

  await input.repository.updateStatus({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    tripId: current.tripId,
    tripStatus: transition.nextStatus,
  })

  return { changed: true, tripId: current.tripId, tripStatus: transition.nextStatus }
}
