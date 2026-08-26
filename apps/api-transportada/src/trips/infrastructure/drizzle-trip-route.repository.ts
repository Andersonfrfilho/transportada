/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { and, asc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm'

import {
  tripDispatchSnapshots,
  tripDocuments,
  tripStops,
  trips,
  type TripStatus,
} from '../../database/trip.schema.js'
import type {
  DispatchTripPort,
  DispatchTripPreconditions,
  DispatchTripWriteInput,
  DispatchTripWriteResult,
} from '../application/dispatch-trip.use-case.js'
import type { CancelTripPort } from '../application/cancel-trip.use-case.js'
import type { PlanTripRoutePort, TripRouteState } from '../application/plan-trip-route.use-case.js'
import type {
  ReorderTripStopsPort,
  ReorderTripStopsPreconditions,
} from '../application/reorder-trip-stops.use-case.js'
import type { TripDatabase, TripQueryable, TripTransaction } from './trip-queryable.type.js'

/** Nota que pode virar `SEM ENDEREÇO`/pendência de rota: viva, mas ainda não chegou a `loaded`. */
const NOT_LOADED_STATUSES = ['pending', 'separated'] as const

/**
 * Reordenar troca a `sequence` de todas as paradas da viagem numa tacada, e a unique
 * `(company_id, trip_id, sequence)` não é adiável — trocar a posição 1↔2 direto colidiria com a
 * própria linha que ainda não se moveu. Empurra tudo para um intervalo alto e sem uso primeiro,
 * depois grava os valores finais: nenhum `UPDATE` do segundo passo pode colidir com o que restou
 * do primeiro.
 */
const SEQUENCE_PARKING_OFFSET = 1_000_000

export class DrizzleTripRouteRepository
  implements PlanTripRoutePort, DispatchTripPort, CancelTripPort, ReorderTripStopsPort
{
  public constructor(private readonly database: TripDatabase) {}

  public async readRouteState(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripRouteState | null> {
    return readRouteState(this.database, input)
  }

  public async markRoutePlanned(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus> {
    const [updated] = await this.database
      .update(trips)
      .set({ status: 'route_planned', updatedAt: sql`now()` })
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .returning({ status: trips.status })
    return updated?.status ?? 'route_planned'
  }

  public async readPreconditions(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<DispatchTripPreconditions | null> {
    const route = await readRouteState(this.database, input)
    if (route === null) return null

    const unloadedRows = await this.database
      .select({ id: tripDocuments.id })
      .from(tripDocuments)
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.tripId, input.tripId),
          isNull(tripDocuments.releasedAt),
          inArray(tripDocuments.separationStatus, [...NOT_LOADED_STATUSES]),
        ),
      )

    return {
      hasRoute: route.hasRoute,
      tripStatus: route.tripStatus,
      unloadedDocumentIds: unloadedRows.map((row) => row.id),
    }
  }

  public async dispatch(input: DispatchTripWriteInput): Promise<DispatchTripWriteResult> {
    return this.database.transaction((transaction) => dispatch(transaction, input))
  }

  public async readTripStatus(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus | null> {
    const [record] = await this.database
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    return record?.status ?? null
  }

  public async markCancelled(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus> {
    const [updated] = await this.database
      .update(trips)
      .set({ status: 'cancelled', updatedAt: sql`now()` })
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .returning({ status: trips.status })
    return updated?.status ?? 'cancelled'
  }

  public async readStopOrderPreconditions(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<ReorderTripStopsPreconditions | null> {
    const [tripRecord] = await this.database
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (tripRecord === undefined) return null

    const stopRows = await this.database
      .select({ id: tripStops.id })
      .from(tripStops)
      .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))

    return { stopIds: stopRows.map((row) => row.id), tripStatus: tripRecord.status }
  }

  public async reorderStops(input: {
    readonly companyId: string
    readonly orderedStopIds: readonly string[]
    readonly tripId: string
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(tripStops)
        .set({ sequence: sql`${tripStops.sequence} + ${SEQUENCE_PARKING_OFFSET}` })
        .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))

      for (const [index, stopId] of input.orderedStopIds.entries()) {
        await transaction
          .update(tripStops)
          .set({ sequence: BigInt(index + 1), updatedAt: sql`now()` })
          .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.id, stopId)))
      }
    })
  }
}

async function readRouteState(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<TripRouteState | null> {
  const [tripRecord] = await queryable
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  if (tripRecord === undefined) return null

  const [stopCount] = await queryable
    .select({ count: sql<number>`count(*)::int` })
    .from(tripStops)
    .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))

  const [unassignedLiveDocument] = await queryable
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.tripId, input.tripId),
        isNull(tripDocuments.releasedAt),
        isNull(tripDocuments.stopId),
        ne(tripDocuments.separationStatus, 'returned'),
      ),
    )
    .limit(1)

  const hasAnyStop = (stopCount?.count ?? 0) > 0
  return {
    hasRoute: hasAnyStop && unassignedLiveDocument === undefined,
    tripStatus: tripRecord.status,
  }
}

async function dispatch(
  transaction: TripTransaction,
  input: DispatchTripWriteInput,
): Promise<DispatchTripWriteResult> {
  if (input.unloadedDocumentIds.length > 0) {
    await releaseUnloadedDocuments(transaction, input)
  }

  const snapshot = await buildRouteSnapshot(transaction, input)
  const snapshotSha256 = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')

  await transaction.insert(tripDispatchSnapshots).values({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    forceReason: input.forceReason,
    forced: input.forced,
    snapshot,
    snapshotSha256,
    tripId: input.tripId,
  })

  const [updated] = await transaction
    .update(trips)
    .set({ status: 'dispatched', updatedAt: sql`now()` })
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .returning({ status: trips.status })

  return { tripStatus: updated?.status ?? 'dispatched' }
}

async function releaseUnloadedDocuments(
  transaction: TripTransaction,
  input: {
    readonly companyId: string
    readonly tripId: string
    readonly unloadedDocumentIds: readonly string[]
  },
): Promise<void> {
  // A parada de cada nota tem de ser lida **antes** do UPDATE: `RETURNING` devolve o estado novo
  // da linha, e a T010 acabou de descobrir isso do jeito caro — nulava `stopId` e depois tentava
  // ler `stopId` do próprio `RETURNING`, sempre vazio.
  const beforeRelease = await transaction
    .select({ stopId: tripDocuments.stopId })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.tripId, input.tripId),
        inArray(tripDocuments.id, [...input.unloadedDocumentIds]),
      ),
    )
  const affectedStopIds = [
    ...new Set(
      beforeRelease.map((row) => row.stopId).filter((stopId): stopId is string => stopId !== null),
    ),
  ]

  // `stopId: null` sai aqui — antes do DELETE da parada, nunca depois. A FK é `restrict`
  // (schema.ts), então a nota tem de soltar a parada por conta própria; esperar o banco fazer
  // isso sozinho foi o bug original (uma FK composta com `set null` zeraria `company_id` junto,
  // e ele é `not null`).
  await transaction
    .update(tripDocuments)
    .set({ releasedAt: sql`now()`, stopId: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.tripId, input.tripId),
        inArray(tripDocuments.id, [...input.unloadedDocumentIds]),
      ),
    )

  if (affectedStopIds.length === 0) return

  // ADR-0043 §3: a parada é derivada — some quando a última nota viva sai dela. Uma consulta para
  // todas as paradas afetadas, um DELETE para as que esvaziaram.
  const stillOccupied = await transaction
    .select({ stopId: tripDocuments.stopId })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        inArray(tripDocuments.stopId, affectedStopIds),
        isNull(tripDocuments.releasedAt),
      ),
    )
  const occupiedStopIds = new Set(
    stillOccupied.map((row) => row.stopId).filter((stopId): stopId is string => stopId !== null),
  )
  const emptiedStopIds = affectedStopIds.filter((stopId) => !occupiedStopIds.has(stopId))
  if (emptiedStopIds.length === 0) return

  await transaction
    .delete(tripStops)
    .where(and(eq(tripStops.companyId, input.companyId), inArray(tripStops.id, emptiedStopIds)))
}

type RouteSnapshotStop = {
  readonly documentIds: readonly string[]
  readonly id: string
  readonly label: string
  readonly sequence: number
}

type RouteSnapshot = { readonly stops: readonly RouteSnapshotStop[] }

async function buildRouteSnapshot(
  transaction: TripTransaction,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<RouteSnapshot> {
  const stopRows = await transaction
    .select({ id: tripStops.id, label: tripStops.label, sequence: tripStops.sequence })
    .from(tripStops)
    .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))
    .orderBy(asc(tripStops.sequence))

  const documentRows = await transaction
    .select({ id: tripDocuments.id, stopId: tripDocuments.stopId })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.tripId, input.tripId),
        isNull(tripDocuments.releasedAt),
        notInArray(tripDocuments.separationStatus, ['returned']),
      ),
    )

  const documentIdsByStop = new Map<string, string[]>()
  for (const row of documentRows) {
    if (row.stopId === null) continue
    const list = documentIdsByStop.get(row.stopId) ?? []
    list.push(row.id)
    documentIdsByStop.set(row.stopId, list)
  }

  return {
    stops: stopRows.map((stop) => ({
      documentIds: documentIdsByStop.get(stop.id) ?? [],
      id: stop.id,
      label: stop.label,
      sequence: Number(stop.sequence),
    })),
  }
}
