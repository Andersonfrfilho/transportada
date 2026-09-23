/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0068 §2: o único escritor de `trip_status_events`. Toda troca de `trips.status` grava aqui,
 * na mesma transação do `UPDATE trips` — nunca antes, nunca depois. Só grava quando o status mudou
 * de fato: `fromStatus === toStatus` é no-op silencioso, não erro (ex.: `completeTripIfSettled`
 * repetido sobre uma viagem já concluída).
 */
import { tripStatusEvents } from '../../database/trip.schema.js'
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
    fromStatus: params.fromStatus,
    onBehalfOfDriverId: params.onBehalfOfDriverId,
    toStatus: params.toStatus,
    tripId: params.tripId,
    ...(params.occurredAt === undefined ? {} : { occurredAt: params.occurredAt }),
  })
}

/**
 * Spec 171 RF1: o segundo (e único outro) escritor de `trip_status_events` — o nascimento da
 * viagem. Grava sempre, sem o guard de no-op de `recordTripStatusChange`: `fromStatus = toStatus`
 * aqui é o próprio sinal que a leitura (`listCreatedRows`) usa para separar `trip.created` de
 * `trip.status_changed` — uma transição real nunca produz essa combinação.
 */
export async function recordTripCreation(
  transaction: TripTransaction,
  params: RecordTripCreationParams,
): Promise<void> {
  await transaction.insert(tripStatusEvents).values({
    actorUserId: params.actorUserId,
    channel: params.channel,
    companyId: params.companyId,
    fromStatus: params.status,
    onBehalfOfDriverId: null,
    toStatus: params.status,
    tripId: params.tripId,
  })
}
