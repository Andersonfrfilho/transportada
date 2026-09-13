/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D8 (G006): o upsert que decide entre nascer, reabrir ou não fazer nada — e é a mesma
 * transação que grava o outbox, nunca uma escrita solta depois.
 *
 * ⚠️ Reabre `failed` e, pela D14/D16, `queued`/`running` com `updated_at` mais velho que o lease do
 * worker — mensagem perdida ou worker morto no meio. `ready` e o pedido recente ficam no-op: enfileirar
 * de novo duplicaria o trabalho do worker sem trazer nada de volta.
 */
import { and, eq, sql, type SQL } from 'drizzle-orm'

import {
  CARGO_LAYOUT_OUTBOX_EVENT_TYPES,
  tripCargoLayoutOutbox,
} from '../../database/trip-cargo-layout-outbox.schema.js'
import { tripCargoLayouts } from '../../database/trip-cargo-layout.schema.js'
import type {
  UpsertCargoLayoutRequestParams,
  UpsertCargoLayoutRequestResult,
} from '../application/cargo-layout-request.types.js'
import type { TripTransaction } from './trip-queryable.type.js'

const [CARGO_LAYOUT_REQUESTED_EVENT_TYPE] = CARGO_LAYOUT_OUTBOX_EVENT_TYPES

function buildCargoLayoutReopenCondition(leaseMs: number): SQL {
  return sql`${tripCargoLayouts.status} = 'failed' or (${tripCargoLayouts.status} in ('queued', 'running') and ${tripCargoLayouts.updatedAt} < now() - (${leaseMs} * interval '1 millisecond'))`
}

async function handleNoOpRequest(
  transaction: TripTransaction,
  params: UpsertCargoLayoutRequestParams,
): Promise<UpsertCargoLayoutRequestResult> {
  const [existing] = await transaction
    .select({
      id: tripCargoLayouts.id,
      status: tripCargoLayouts.status,
      tripId: tripCargoLayouts.tripId,
    })
    .from(tripCargoLayouts)
    .where(
      and(
        eq(tripCargoLayouts.companyId, params.companyId),
        eq(tripCargoLayouts.inputHash, params.inputHash),
      ),
    )
    .limit(1)

  if (existing === undefined) {
    throw new Error('Expected an existing trip cargo layout row after a no-op conflict')
  }

  /** D3: a prévia virou viagem real — o pedido antigo aprende o `tripId`, sem reabrir nem enfileirar. */
  if (params.tripId !== null && existing.tripId === null) {
    await transaction
      .update(tripCargoLayouts)
      .set({ tripId: params.tripId, updatedAt: sql`now()` })
      .where(eq(tripCargoLayouts.id, existing.id))
  }

  return { enqueued: false, layoutId: existing.id, status: existing.status }
}

export async function upsertCargoLayoutRequest(
  transaction: TripTransaction,
  params: UpsertCargoLayoutRequestParams,
): Promise<UpsertCargoLayoutRequestResult> {
  const [upserted] = await transaction
    .insert(tripCargoLayouts)
    .values({
      companyId: params.companyId,
      input: params.input,
      inputHash: params.inputHash,
      policyVersion: params.policyVersion,
      tripId: params.tripId,
    })
    .onConflictDoUpdate({
      set: {
        attempt: 0,
        errorCode: '',
        layout: null,
        status: 'queued',
        tripId: sql`coalesce(excluded.trip_id, ${tripCargoLayouts.tripId})`,
        updatedAt: sql`now()`,
      },
      target: [tripCargoLayouts.companyId, tripCargoLayouts.inputHash],
      where: buildCargoLayoutReopenCondition(params.leaseMs),
    })
    .returning({ id: tripCargoLayouts.id, status: tripCargoLayouts.status })

  if (upserted === undefined) return handleNoOpRequest(transaction, params)

  await transaction.insert(tripCargoLayoutOutbox).values({
    companyId: params.companyId,
    correlationId: params.correlationId,
    eventType: CARGO_LAYOUT_REQUESTED_EVENT_TYPE,
    layoutId: upserted.id,
    payload: { inputHash: params.inputHash, layoutId: upserted.id },
  })

  return { enqueued: true, layoutId: upserted.id, status: upserted.status }
}
