/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D8 (G006): o upsert que decide entre nascer, reabrir ou não fazer nada — e é a mesma
 * transação que grava o outbox, nunca uma escrita solta depois.
 *
 * ⚠️ Reabre `failed`, `queued` e `running` só com `updated_at` mais velho que o lease do worker
 * (D14/D16/D18) — mensagem perdida, worker morto no meio, ou a espera depois de uma falha. `ready` e o
 * pedido recente ficam no-op: enfileirar de novo duplicaria o trabalho do worker sem trazer nada.
 */
import { and, eq, sql, type SQL } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'

import {
  CARGO_LAYOUT_OUTBOX_EVENT_TYPES,
  tripCargoLayoutOutbox,
} from '../../database/trip-cargo-layout-outbox.schema.js'
import { inList } from '../../database/schema-check.constant.js'
import { tripCargoLayouts } from '../../database/trip-cargo-layout.schema.js'
import type {
  ReopenStoredCargoLayoutParams,
  UpsertCargoLayoutRequestParams,
  UpsertCargoLayoutRequestResult,
} from '../application/cargo-layout-request.types.js'
import type { StoredCargoLayoutInput } from '../domain/cargo-layout-hash.types.js'
import {
  CARGO_LAYOUT_REOPENABLE_STATUSES,
  CARGO_LAYOUT_STATUS,
} from './cargo-layout-status.constant.js'
import type { TripTransaction } from './trip-queryable.type.js'

const [CARGO_LAYOUT_REQUESTED_EVENT_TYPE] = CARGO_LAYOUT_OUTBOX_EVENT_TYPES

/** D14: a mesma cláusula de tempo do claim do worker — a leitura do detalhe (T10) decide por ela. */
export function buildCargoLayoutLeaseExpiredCondition(leaseMs: number): SQL {
  return sql`${tripCargoLayouts.updatedAt} < now() - (${leaseMs} * interval '1 millisecond')`
}

/** D18: `failed` também espera o lease — reabrir falha recente a cada leitura não teria teto. */
function buildCargoLayoutReopenCondition(leaseMs: number): SQL {
  return sql`${tripCargoLayouts.status} in (${sql.raw(inList(CARGO_LAYOUT_REOPENABLE_STATUSES))}) and ${buildCargoLayoutLeaseExpiredCondition(leaseMs)}`
}

/**
 * Revisão final (M3): o hash ignora etiqueta, então a mesma chave pode chegar com rótulo novo. A linha
 * na fila passa a empacotar o rótulo de agora. `updated_at` só muda quando a viagem é aprendida — ele é
 * o relógio do lease (D14/D18), e empurrá-lo a cada pedido adiaria a recuperação de um `running` órfão.
 */
function buildNoOpUpdate(
  params: UpsertCargoLayoutRequestParams,
  existingTripId: string | null,
): PgUpdateSetSource<typeof tripCargoLayouts> {
  /** D3: a prévia virou viagem real — o pedido antigo aprende o `tripId`, sem reabrir nem enfileirar. */
  if (params.tripId !== null && existingTripId === null) {
    return { input: params.input, tripId: params.tripId, updatedAt: sql`now()` }
  }
  return { input: params.input }
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

  await transaction
    .update(tripCargoLayouts)
    .set(buildNoOpUpdate(params, existing.tripId))
    .where(
      and(eq(tripCargoLayouts.companyId, params.companyId), eq(tripCargoLayouts.id, existing.id)),
    )

  return { enqueued: false, layoutId: existing.id, status: existing.status }
}

/**
 * Spec 145 T11 (D16/D18): o polling reabre pela própria linha — entrada, hash, versão e viagem que ela
 * guarda —, sem reler a viagem nem recalcular o hash. O mesmo upsert decide se reabre. `undefined` é
 * linha ausente nesta empresa.
 */
export async function reopenStoredCargoLayoutRequest(
  transaction: TripTransaction,
  params: ReopenStoredCargoLayoutParams & { readonly leaseMs: number },
): Promise<UpsertCargoLayoutRequestResult | undefined> {
  const [stored] = await transaction
    .select({
      input: tripCargoLayouts.input,
      inputHash: tripCargoLayouts.inputHash,
      policyVersion: tripCargoLayouts.policyVersion,
      tripId: tripCargoLayouts.tripId,
    })
    .from(tripCargoLayouts)
    .where(
      and(
        eq(tripCargoLayouts.companyId, params.companyId),
        eq(tripCargoLayouts.id, params.layoutId),
      ),
    )
    .limit(1)
  if (stored === undefined) return undefined

  return upsertCargoLayoutRequest(transaction, {
    companyId: params.companyId,
    correlationId: params.correlationId,
    // `input` só é escrito por este módulo, com `buildStoredCargoLayoutInput` (T6b)
    input: stored.input as StoredCargoLayoutInput,
    inputHash: stored.inputHash,
    leaseMs: params.leaseMs,
    policyVersion: stored.policyVersion,
    tripId: stored.tripId,
  })
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
        /** M3: reabrir empacota a entrada de agora — com o mesmo hash, só a etiqueta pode ter mudado. */
        input: sql`excluded.input`,
        layout: null,
        status: CARGO_LAYOUT_STATUS.queued,
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
