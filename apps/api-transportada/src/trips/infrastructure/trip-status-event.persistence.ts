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
import type { RecordTripStatusChangeParams } from './trip-status-event.types.js'

export type { RecordTripStatusChangeParams } from './trip-status-event.types.js'

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
