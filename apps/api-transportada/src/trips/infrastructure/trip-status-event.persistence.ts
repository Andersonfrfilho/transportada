/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0068 §2: o único escritor de transição em `trip_status_events`. Toda troca de `trips.status`
 * grava aqui, na mesma transação do `UPDATE trips` — nunca antes, nunca depois. Só grava quando o
 * status mudou de fato: `fromStatus === toStatus` é no-op silencioso, não erro (ex.:
 * `completeTripIfSettled` repetido sobre uma viagem já concluída).
 */
import { TRIP_STATUS_EVENT_KINDS, tripStatusEvents } from '../../database/trip.schema.js'
import type { TripTransaction } from './trip-queryable.type.js'
import type {
  RecordTripCreationParams,
  RecordTripStatusChangeParams,
} from './trip-status-event.types.js'

export type {
  RecordTripCreationParams,
  RecordTripStatusChangeParams,
} from './trip-status-event.types.js'

export async function recordTripStatusChange(
  transaction: TripTransaction,
  params: RecordTripStatusChangeParams,
): Promise<void> {
  if (params.fromStatus === params.toStatus) return

  await transaction.insert(tripStatusEvents).values({
    actorUserId: params.actorUserId,
    channel: params.channel,
    companyId: params.companyId,
    eventKind: TRIP_STATUS_EVENT_KINDS.transition,
    fromStatus: params.fromStatus,
    onBehalfOfDriverId: params.onBehalfOfDriverId,
    toStatus: params.toStatus,
    tripId: params.tripId,
    ...(params.occurredAt === undefined ? {} : { occurredAt: params.occurredAt }),
  })
}

/**
 * Spec 171 RF1: o segundo (e único outro) escritor de `trip_status_events` — o nascimento da
 * viagem. Grava sempre, sem o guard de no-op de `recordTripStatusChange`. `eventKind: 'created'` é
 * o sinal que a leitura (`listCreatedRows`) usa para separar `trip.created` de
 * `trip.status_changed` — nunca a igualdade de `fromStatus`/`toStatus`, que o banco também garante
 * ser impossível numa transição real (`trip_status_events_transition_check`).
 */
export async function recordTripCreation(
  transaction: TripTransaction,
  params: RecordTripCreationParams,
): Promise<void> {
  await transaction.insert(tripStatusEvents).values({
    actorUserId: params.actorUserId,
    channel: params.channel,
    companyId: params.companyId,
    eventKind: TRIP_STATUS_EVENT_KINDS.created,
    fromStatus: params.status,
    onBehalfOfDriverId: null,
    toStatus: params.status,
    tripId: params.tripId,
  })
}
