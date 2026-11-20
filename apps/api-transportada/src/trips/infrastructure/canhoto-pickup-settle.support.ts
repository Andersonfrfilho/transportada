/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321: o fechamento da coleta de canhoto e as travas que ele pede, num arquivo sem dependência do repositório de campo
 * (quem fecha a coleta pela entrega da nota, `markDocumentDelivered`, mora nele).
 *
 * Ordem das travas (ADR-0068 §2): viagem da coleta `FOR NO KEY UPDATE`, depois a coleta `FOR UPDATE`, depois a ocorrência
 * `FOR NO KEY UPDATE` (a ordem da 266).
 */
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'

import { tripOccurrenceResolutionEvents } from '../../database/occurrence-conversation.schema.js'
import {
  tripCanhotoPickups,
  tripDocumentOccurrences,
  tripDocuments,
  tripStops,
  trips,
} from '../../database/trip.schema.js'
import {
  CANHOTO_PICKUP_OPEN_STATUSES,
  type CanhotoPickupStatus,
} from '../../shared/canhoto-pickup.constant.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** O que a conferência fez com a coleta, para quem quiser contar (log, teste). */
export type CanhotoPickupSettlement =
  | { readonly kind: 'collected'; readonly pickupId: string; readonly resolved: boolean }
  | {
      readonly kind: 'reopened'
      readonly pickupId: string
      readonly reopenedOccurrence: boolean
      readonly status: CanhotoPickupStatus
    }
  | { readonly kind: 'none' }

export type LockedPickup = {
  readonly id: string
  readonly occurrenceId: string
  readonly photoSentAt: Date | null
  readonly pickupStopId: null | string
  readonly pickupTripId: null | string
  readonly status: CanhotoPickupStatus
}

export const pickupColumns = {
  id: tripCanhotoPickups.id,
  occurrenceId: tripCanhotoPickups.occurrenceId,
  photoSentAt: tripCanhotoPickups.photoSentAt,
  pickupStopId: tripCanhotoPickups.pickupStopId,
  pickupTripId: tripCanhotoPickups.pickupTripId,
  status: tripCanhotoPickups.status,
}

/** Trava a viagem (se há) e depois a coleta, e relê a coleta depois das travas. */
export async function lockPickupInOrder(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly pickupId: string },
): Promise<LockedPickup | null> {
  const [unlocked] = await queryable
    .select({ pickupTripId: tripCanhotoPickups.pickupTripId })
    .from(tripCanhotoPickups)
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        eq(tripCanhotoPickups.id, input.pickupId),
      ),
    )
    .limit(1)
  if (unlocked === undefined) return null
  if (unlocked.pickupTripId !== null) {
    await queryable
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, unlocked.pickupTripId)))
      .for('no key update')
  }
  const [locked] = await queryable
    .select(pickupColumns)
    .from(tripCanhotoPickups)
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        eq(tripCanhotoPickups.id, input.pickupId),
      ),
    )
    .for('update')
    .limit(1)
  return locked ?? null
}

/** A ocorrência travada (266): `undefined` se não existe; `cancelled` vence o histórico. */
export async function lockOccurrence(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<{ readonly cancelled: boolean } | undefined> {
  const [row] = await queryable
    .select({ cancelledAt: tripDocumentOccurrences.cancelledAt })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
      ),
    )
    .for('no key update')
    .limit(1)
  return row === undefined ? undefined : { cancelled: row.cancelledAt !== null }
}

/** O último evento do andamento (por `seq`, nunca por `created_at`), lido **depois** da trava da ocorrência. */
export async function readLatestResolutionKind(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<'reopened' | 'resolved' | undefined> {
  const [row] = await queryable
    .select({ kind: tripOccurrenceResolutionEvents.kind })
    .from(tripOccurrenceResolutionEvents)
    .where(
      and(
        eq(tripOccurrenceResolutionEvents.companyId, input.companyId),
        eq(tripOccurrenceResolutionEvents.documentOccurrenceId, input.occurrenceId),
      ),
    )
    .orderBy(desc(tripOccurrenceResolutionEvents.sequence))
    .limit(1)
  return row?.kind
}

export async function insertSystemResolutionEvent(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly kind: 'reopened' | 'resolved'
    readonly occurrenceId: string
    readonly pickupId: string
  },
): Promise<void> {
  await queryable.insert(tripOccurrenceResolutionEvents).values({
    actorKind: 'system',
    actorUserId: null,
    canhotoPickupId: input.pickupId,
    companyId: input.companyId,
    documentOccurrenceId: input.occurrenceId,
    kind: input.kind,
  })
}

/**
 * A parada só de coleta (sem nota viva e sem outra coleta encaixada ainda aberta) fecha com o canhoto: chegada que
 * ninguém tocou vira a hora do fechamento (o CHECK exige chegada antes do fim). Parada com nota fecha pelas notas, como
 * sempre. Devolve `true` quando fechou agora.
 */
export async function closePickupOnlyStop(
  queryable: TripQueryable,
  input: {
    readonly at: Date
    readonly companyId: string
    readonly pickupId: string
    readonly stopId: string
  },
): Promise<boolean> {
  const liveDocuments = queryable
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.stopId, input.stopId),
        isNull(tripDocuments.releasedAt),
      ),
    )
  const otherWaitingPickups = queryable
    .select({ id: tripCanhotoPickups.id })
    .from(tripCanhotoPickups)
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        eq(tripCanhotoPickups.pickupStopId, input.stopId),
        ne(tripCanhotoPickups.id, input.pickupId),
        eq(tripCanhotoPickups.status, 'scheduled'),
        isNull(tripCanhotoPickups.photoSentAt),
      ),
    )
  const closed = await queryable
    .update(tripStops)
    .set({
      arrivedAt: sql`coalesce(${tripStops.arrivedAt}, ${input.at.toISOString()}::timestamptz)`,
      completedAt: input.at,
      enRouteSince: null,
      enRouteTappedAt: null,
      updatedAt: input.at,
    })
    .where(
      and(
        eq(tripStops.companyId, input.companyId),
        eq(tripStops.id, input.stopId),
        isNull(tripStops.completedAt),
        sql`not exists ${liveDocuments}`,
        sql`not exists ${otherWaitingPickups}`,
      ),
    )
    .returning({ id: tripStops.id })
  return closed.length > 0
}

/**
 * Aprovado (ou entregue): a coleta aberta da nota vira `collected` e a ocorrência resolve (se ainda não estava resolvida).
 * `matchByNote` (a entrega da nota, 321 emenda): a coleta é a da **NF-e**, não só a do vínculo de origem — a nota solta
 * para outra viagem entrega por um vínculo novo, e a marca "Canhoto retido" sai sozinha, por qualquer motorista.
 */
export async function collectOpenPickup(
  queryable: TripQueryable,
  input: {
    readonly at: Date
    readonly companyId: string
    readonly documentId: string
    readonly matchByNote?: boolean
  },
): Promise<CanhotoPickupSettlement> {
  const sameNote =
    input.matchByNote === true
      ? or(
          eq(tripCanhotoPickups.originTripDocumentId, input.documentId),
          sql`${tripCanhotoPickups.nfeDocumentId} = (
            select ${tripDocuments.nfeDocumentId} from ${tripDocuments}
            where ${tripDocuments.companyId} = ${input.companyId} and ${tripDocuments.id} = ${input.documentId}
          )`,
        )
      : eq(tripCanhotoPickups.originTripDocumentId, input.documentId)
  const [candidate] = await queryable
    .select({ id: tripCanhotoPickups.id })
    .from(tripCanhotoPickups)
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        sameNote,
        inArray(tripCanhotoPickups.status, [...CANHOTO_PICKUP_OPEN_STATUSES]),
      ),
    )
    .limit(1)
  if (candidate === undefined) return { kind: 'none' }

  const pickup = await lockPickupInOrder(queryable, {
    companyId: input.companyId,
    pickupId: candidate.id,
  })
  if (
    pickup === null ||
    !(CANHOTO_PICKUP_OPEN_STATUSES as readonly string[]).includes(pickup.status)
  ) {
    return { kind: 'none' }
  }

  await queryable
    .update(tripCanhotoPickups)
    .set({ collectedAt: input.at, status: 'collected', updatedAt: input.at })
    .where(
      and(eq(tripCanhotoPickups.companyId, input.companyId), eq(tripCanhotoPickups.id, pickup.id)),
    )
  if (pickup.pickupStopId !== null) {
    await closePickupOnlyStop(queryable, {
      at: input.at,
      companyId: input.companyId,
      pickupId: pickup.id,
      stopId: pickup.pickupStopId,
    })
  }

  const occurrence = await lockOccurrence(queryable, {
    companyId: input.companyId,
    occurrenceId: pickup.occurrenceId,
  })
  if (occurrence === undefined || occurrence.cancelled) {
    return { kind: 'collected', pickupId: pickup.id, resolved: false }
  }
  const latest = await readLatestResolutionKind(queryable, {
    companyId: input.companyId,
    occurrenceId: pickup.occurrenceId,
  })
  if (latest === 'resolved') return { kind: 'collected', pickupId: pickup.id, resolved: false }
  await insertSystemResolutionEvent(queryable, {
    companyId: input.companyId,
    kind: 'resolved',
    occurrenceId: pickup.occurrenceId,
    pickupId: pickup.id,
  })
  return { kind: 'collected', pickupId: pickup.id, resolved: true }
}

/**
 * A nota foi entregue (qualquer motorista, qualquer canal): a coleta de canhoto aberta dela fecha e a ocorrência resolve
 * pelo `system`. Chamado na transação da baixa, logo depois de gravar `delivered`.
 */
export async function settleCanhotoPickupOnDelivery(
  queryable: TripQueryable,
  input: { readonly at: Date; readonly companyId: string; readonly documentId: string },
): Promise<CanhotoPickupSettlement> {
  return collectOpenPickup(queryable, { ...input, matchByNote: true })
}
