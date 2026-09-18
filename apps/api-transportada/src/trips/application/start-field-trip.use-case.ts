/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import { TRIP_ACTION, checkTripTransition } from '../domain/trip-state.policy.js'
import { TripNotFoundError, TripStateTransitionNotAllowedError } from '../domain/trip.error.js'
import type { FieldTripLocator } from './field-trip-target.types.js'

/**
 * Os dois toques do campo (ADR-0058). O escritório os alcança pela permissão própria, em nome do
 * motorista (ADR-0067 §1); `dispatch` continua só dele.
 */
export const FIELD_TRIP_STEP = {
  confirmLoad: 'confirmLoad',
  startRoute: 'startRoute',
} as const

export type FieldTripStep = (typeof FIELD_TRIP_STEP)[keyof typeof FIELD_TRIP_STEP]

/**
 * Uma gravação que perdeu a corrida relê e decide de novo. O status só anda para a frente, então
 * três voltas cobrem `dispatched → in_transit → on_delivery_route` com folga.
 */
const MAX_STATUS_WRITE_ATTEMPTS = 3

export type StartFieldTripPort = {
  /** `null` quando o motorista não tem viagem na rua — a mesma ausência de `/me/trips/current`. */
  readCurrent(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<{ readonly tripId: string; readonly tripStatus: TripStatus } | null>
  /** O status de agora, para decidir de novo depois de perder a corrida. `null`: a viagem sumiu. */
  readStatus(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus | null>
  /**
   * Compare-and-set: grava só se o status ainda é `expectedStatus`. `false` quando outra escrita
   * chegou antes — e aí nada foi gravado.
   */
  updateStatus(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly expectedStatus: TripStatus
    readonly tripId: string
    readonly tripStatus: TripStatus
  }): Promise<boolean>
}

export type StartFieldTripInput = FieldTripLocator & {
  readonly actorUserId: string
  readonly companyId: string
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
 * **O motorista não manda id de viagem** (ADR-0045 §2): o servidor resolve pelo vínculo, como toda
 * rota sob `/me/trips/current`. O escritório manda, e chega aqui com o alvo já resolvido na empresa
 * do contexto (ADR-0067 §1).
 *
 * Repetir converge em `changed: false`, nunca em erro: a fila offline drena muito depois do toque, e
 * um toque que **funcionou** voltando como conflito puniria quem fez tudo certo.
 */
export async function startFieldTrip(input: StartFieldTripInput): Promise<StartFieldTripResult> {
  const current =
    input.target === undefined
      ? await input.repository.readCurrent({
          companyId: input.companyId,
          driverId: input.driverId,
        })
      : { tripId: input.target.tripId, tripStatus: input.target.tripStatus }
  if (current === null) throw new TripNotFoundError()

  return applyFieldStep({
    attemptsLeft: MAX_STATUS_WRITE_ATTEMPTS,
    input,
    tripId: current.tripId,
    tripStatus: current.tripStatus,
  })
}

type ApplyFieldStepParams = {
  readonly attemptsLeft: number
  readonly input: StartFieldTripInput
  readonly tripId: string
  readonly tripStatus: TripStatus
}

/**
 * A decisão é da política; a gravação só vale sobre o status que a decisão leu. Perder a corrida —
 * a viagem concluiu, ou outro toque já andou — relê e decide de novo, e nunca regride o status.
 */
async function applyFieldStep(params: ApplyFieldStepParams): Promise<StartFieldTripResult> {
  const { input, tripId, tripStatus } = params
  const transition = checkTripTransition({
    action: TRIP_ACTION[input.step],
    /* A viagem já saiu do barracão: o roteiro congelou no despacho, e não há o que replanejar. */
    hasRoute: true,
    tripStatus,
  })

  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }
  if (transition.outcome === 'unchanged' || params.attemptsLeft === 0) {
    return { changed: false, tripId, tripStatus }
  }

  const isWritten = await input.repository.updateStatus({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    expectedStatus: tripStatus,
    tripId,
    tripStatus: transition.nextStatus,
  })
  if (isWritten) return { changed: true, tripId, tripStatus: transition.nextStatus }

  const currentStatus = await input.repository.readStatus({ companyId: input.companyId, tripId })
  if (currentStatus === null) throw new TripNotFoundError()

  return applyFieldStep({
    attemptsLeft: params.attemptsLeft - 1,
    input,
    tripId,
    tripStatus: currentStatus,
  })
}
