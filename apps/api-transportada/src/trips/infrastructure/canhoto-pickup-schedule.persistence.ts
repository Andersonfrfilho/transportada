/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T3 (D4, D7, RF4): o encaixe da coleta de canhoto pelo escritório. A coleta entra na viagem de outro
 * motorista numa parada **no endereço da entrega de origem** (a mesma `address_key` da parada em que o cliente
 * segurou o canhoto): reaproveita a parada aberta da viagem com aquele endereço, ou cria uma no fim da sequência.
 *
 * Nada aqui toca `trip_documents` (D3, CA03): a coleta não é nota, e nenhum leitor de carga a soma (D4c, CA03b).
 *
 * Ordem das travas (ADR-0068 §2): as viagens envolvidas `FOR NO KEY UPDATE` (em ordem de id), depois a coleta
 * `FOR UPDATE` — a mesma ordem do fechamento da viagem, que trava a viagem e só então devolve a coleta a `pending`
 * (`recordTripStatusChange`). A coleta é relida depois da trava; se mudou, `CanhotoPickupChangedError`.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { auditLogs } from '../../database/fiscal-operation.schema.js'
import { nfeDocuments } from '../../database/database.schema.js'
import {
  tripCanhotoPickups,
  tripDocuments,
  tripStops,
  trips,
  type TripStatus,
} from '../../database/trip.schema.js'
import type { CanhotoPickupStatus } from '../../shared/canhoto-pickup.constant.js'
import type {
  CanhotoPickupSchedulePort,
  CanhotoPickupView,
  CanhotoPickupWriteActor,
  CanhotoPickupWriteResult,
} from '../application/canhoto-pickup-schedule.port.js'
import {
  CanhotoPickupChangedError,
  CanhotoPickupNotFoundError,
  CanhotoPickupNotScheduledError,
  CanhotoPickupScheduleRefusedError,
} from '../domain/canhoto-pickup.error.js'
import { decideCanhotoPickupSchedule } from '../domain/canhoto-pickup.policy.js'
import { TripNotFoundError } from '../domain/trip.error.js'
import { TRIP_STATUSES_BEFORE_DISPATCH } from '../domain/trip-state.policy.js'
import { createTripStopReconciliationPort } from './drizzle-trip-stop-reconciliation.support.js'
import { clearPlannedRoute } from './trip-planned-route-clear.support.js'
import type { TripDatabase, TripQueryable, TripTransaction } from './trip-queryable.type.js'

/** A permissão das rotas do encaixe, gravada na trilha. */
export const CANHOTO_PICKUP_SCHEDULE_PERMISSION = 'trip.report-on-behalf'

const AUDIT_ENTITY_TYPE = 'canhoto_pickup'

type PickupRow = {
  readonly id: string
  readonly originStopId: null | string
  readonly originTripId: string
  readonly pickupStopId: null | string
  readonly pickupTripId: null | string
  readonly status: CanhotoPickupStatus
}

function isBeforeDispatch(status: TripStatus): boolean {
  return (TRIP_STATUSES_BEFORE_DISPATCH as readonly TripStatus[]).includes(status)
}

async function readPickup(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly pickupId: string; readonly lock: boolean },
): Promise<PickupRow | null> {
  const query = queryable
    .select({
      id: tripCanhotoPickups.id,
      originStopId: tripDocuments.stopId,
      originTripId: tripDocuments.tripId,
      pickupStopId: tripCanhotoPickups.pickupStopId,
      pickupTripId: tripCanhotoPickups.pickupTripId,
      status: tripCanhotoPickups.status,
    })
    .from(tripCanhotoPickups)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripCanhotoPickups.companyId),
        eq(tripDocuments.id, tripCanhotoPickups.originTripDocumentId),
      ),
    )
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        eq(tripCanhotoPickups.id, input.pickupId),
      ),
    )
    .limit(1)
  const [row] = input.lock ? await query.for('update', { of: tripCanhotoPickups }) : await query
  return row ?? null
}

/** Trava as viagens em ordem de id (duas escritas cruzadas nunca se esperam em ordem inversa). */
async function lockTrips(
  transaction: TripTransaction,
  input: { readonly companyId: string; readonly tripIds: readonly string[] },
): Promise<ReadonlyMap<string, TripStatus>> {
  const statuses = new Map<string, TripStatus>()
  for (const tripId of [...new Set(input.tripIds)].sort()) {
    const [row] = await transaction
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, tripId)))
      .for('no key update')
      .limit(1)
    if (row !== undefined) statuses.set(tripId, row.status)
  }
  return statuses
}

function samePickup(read: PickupRow, locked: PickupRow | null): boolean {
  return (
    locked !== null &&
    locked.status === read.status &&
    locked.pickupTripId === read.pickupTripId &&
    locked.pickupStopId === read.pickupStopId
  )
}

/**
 * A parada que a coleta deixou some quando ficou vazia e intocada — sem nota, sem outra coleta, e sem chegada,
 * baixa ou "a caminho" (apagar parada tocada apagaria eventos da rua em cascata). Antes do despacho a rota planejada
 * morre junto (spec 153 T704) e a viagem entra em `tripsToRefreeze`.
 */
async function removeStopIfEmpty(
  transaction: TripTransaction,
  input: {
    readonly companyId: string
    readonly stopId: string
    readonly tripId: string
    readonly tripStatus: TripStatus | undefined
    readonly tripsToRefreeze: Set<string>
  },
): Promise<void> {
  const [stop] = await transaction
    .select({
      arrivedAt: tripStops.arrivedAt,
      completedAt: tripStops.completedAt,
      enRouteSince: tripStops.enRouteSince,
    })
    .from(tripStops)
    .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.id, input.stopId)))
    .limit(1)
  if (stop === undefined) return
  if (stop.arrivedAt !== null || stop.completedAt !== null || stop.enRouteSince !== null) return

  const port = createTripStopReconciliationPort(transaction)
  const occupants = await port.countLiveDocumentsAtStop({
    companyId: input.companyId,
    stopId: input.stopId,
  })
  if (occupants > 0) return

  await port.deleteStop({ companyId: input.companyId, stopId: input.stopId })
  if (input.tripStatus !== undefined && isBeforeDispatch(input.tripStatus)) {
    await clearPlannedRoute(transaction, { companyId: input.companyId, tripId: input.tripId })
    input.tripsToRefreeze.add(input.tripId)
  }
}

/** Devolve a coleta a `pending` e limpa a parada que ela deixou (desencaixe e re-encaixe). */
async function detachPickup(
  transaction: TripTransaction,
  input: {
    readonly companyId: string
    readonly pickup: PickupRow
    readonly tripStatuses: ReadonlyMap<string, TripStatus>
    readonly tripsToRefreeze: Set<string>
  },
): Promise<void> {
  const { companyId, pickup } = input
  await transaction
    .update(tripCanhotoPickups)
    .set({ pickupStopId: null, pickupTripId: null, status: 'pending', updatedAt: new Date() })
    .where(and(eq(tripCanhotoPickups.companyId, companyId), eq(tripCanhotoPickups.id, pickup.id)))
  if (pickup.pickupStopId !== null && pickup.pickupTripId !== null) {
    await removeStopIfEmpty(transaction, {
      companyId,
      stopId: pickup.pickupStopId,
      tripId: pickup.pickupTripId,
      tripStatus: input.tripStatuses.get(pickup.pickupTripId),
      tripsToRefreeze: input.tripsToRefreeze,
    })
  }
}

/**
 * Spec 321 T3: retirar a parada do rascunho (`retireStop`) leva junto as coletas encaixadas nela — elas voltam a
 * `pending`, e a parada esvazia. Roda na transação da retirada, que já conferiu a janela da viagem.
 */
export async function detachCanhotoPickupsAtStop(
  transaction: TripTransaction,
  input: { readonly companyId: string; readonly stopId: string; readonly tripId: string },
): Promise<number> {
  const detached = await transaction
    .update(tripCanhotoPickups)
    .set({ pickupStopId: null, pickupTripId: null, status: 'pending', updatedAt: new Date() })
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        eq(tripCanhotoPickups.pickupTripId, input.tripId),
        eq(tripCanhotoPickups.pickupStopId, input.stopId),
        eq(tripCanhotoPickups.status, 'scheduled'),
      ),
    )
    .returning({ id: tripCanhotoPickups.id })
  return detached.length
}

/** A parada aberta da viagem no endereço da entrega, ou uma nova no fim da sequência (sem ETA, como a 257). */
async function reconcilePickupStop(
  transaction: TripTransaction,
  input: {
    readonly companyId: string
    readonly originStopId: string
    readonly tripId: string
    readonly tripStatus: TripStatus
    readonly tripsToRefreeze: Set<string>
  },
): Promise<string> {
  const [origin] = await transaction
    .select({ addressKey: tripStops.addressKey, label: tripStops.label })
    .from(tripStops)
    .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.id, input.originStopId)))
    .limit(1)
  if (origin === undefined) throw new CanhotoPickupScheduleRefusedError('without_origin_address')

  const [open] = await transaction
    .select({ id: tripStops.id })
    .from(tripStops)
    .where(
      and(
        eq(tripStops.companyId, input.companyId),
        eq(tripStops.tripId, input.tripId),
        eq(tripStops.addressKey, origin.addressKey),
        isNull(tripStops.arrivedAt),
        isNull(tripStops.completedAt),
      ),
    )
    .orderBy(asc(tripStops.sequence))
    .limit(1)
  if (open !== undefined) return open.id

  const port = createTripStopReconciliationPort(transaction)
  const sequence = await port.nextStopSequence({
    companyId: input.companyId,
    tripId: input.tripId,
  })
  const created = await port.createStop({
    addressKey: origin.addressKey,
    companyId: input.companyId,
    label: origin.label,
    sequence,
    tripId: input.tripId,
  })
  if (isBeforeDispatch(input.tripStatus)) {
    await clearPlannedRoute(transaction, { companyId: input.companyId, tripId: input.tripId })
    input.tripsToRefreeze.add(input.tripId)
  }
  return created.id
}

async function recordAudit(
  transaction: TripTransaction,
  input: CanhotoPickupWriteActor & {
    readonly action: 'scheduled' | 'unscheduled'
    readonly after: { readonly pickupStopId: null | string; readonly pickupTripId: null | string }
    readonly before: PickupRow
  },
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: `${AUDIT_ENTITY_TYPE}.${input.action}`,
    actorUserId: input.actorUserId,
    afterSnapshot: {
      pickupStopId: input.after.pickupStopId,
      pickupTripId: input.after.pickupTripId,
      status: input.after.pickupTripId === null ? 'pending' : 'scheduled',
    },
    beforeSnapshot: {
      pickupStopId: input.before.pickupStopId,
      pickupTripId: input.before.pickupTripId,
      status: input.before.status,
    },
    companyId: input.companyId,
    correlationId: input.correlationId,
    entityId: input.before.id,
    entityType: AUDIT_ENTITY_TYPE,
    metadata: {},
    permission: CANHOTO_PICKUP_SCHEDULE_PERMISSION,
    targetId: input.before.id,
    targetType: AUDIT_ENTITY_TYPE,
  })
}

async function listPickupViews(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly limit: number
    readonly pickupId?: string
    readonly statuses?: readonly CanhotoPickupStatus[]
    readonly tripId?: string
  },
): Promise<readonly CanhotoPickupView[]> {
  const rows = await queryable
    .select({
      createdAt: tripCanhotoPickups.createdAt,
      documentNumber: nfeDocuments.number,
      id: tripCanhotoPickups.id,
      nfeDocumentId: tripCanhotoPickups.nfeDocumentId,
      occurrenceId: tripCanhotoPickups.occurrenceId,
      originStopLabel: tripStops.label,
      originTripDocumentId: tripCanhotoPickups.originTripDocumentId,
      originTripId: tripDocuments.tripId,
      pickupStopId: tripCanhotoPickups.pickupStopId,
      pickupTripId: tripCanhotoPickups.pickupTripId,
      status: tripCanhotoPickups.status,
    })
    .from(tripCanhotoPickups)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripCanhotoPickups.companyId),
        eq(tripDocuments.id, tripCanhotoPickups.originTripDocumentId),
      ),
    )
    .leftJoin(
      tripStops,
      and(eq(tripStops.companyId, tripDocuments.companyId), eq(tripStops.id, tripDocuments.stopId)),
    )
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripCanhotoPickups.companyId),
        eq(nfeDocuments.id, tripCanhotoPickups.nfeDocumentId),
      ),
    )
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        input.pickupId === undefined ? undefined : eq(tripCanhotoPickups.id, input.pickupId),
        input.statuses === undefined || input.statuses.length === 0
          ? undefined
          : inArray(tripCanhotoPickups.status, [...input.statuses]),
        input.tripId === undefined ? undefined : eq(tripCanhotoPickups.pickupTripId, input.tripId),
      ),
    )
    .orderBy(desc(tripCanhotoPickups.createdAt), desc(tripCanhotoPickups.id))
    .limit(input.limit)
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

async function readPickupView(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly pickupId: string },
): Promise<CanhotoPickupView> {
  const [view] = await listPickupViews(queryable, { ...input, limit: 1 })
  if (view === undefined) throw new CanhotoPickupNotFoundError()
  return view
}

export function createDrizzleCanhotoPickupSchedule(
  database: TripDatabase,
): CanhotoPickupSchedulePort {
  return {
    list: (params) => listPickupViews(database, params),

    async schedule(params): Promise<CanhotoPickupWriteResult> {
      const { companyId } = params
      const read = await readPickup(database, { ...params, lock: false })
      if (read === null) throw new CanhotoPickupNotFoundError()

      return database.transaction(async (transaction) => {
        const tripStatuses = await lockTrips(transaction, {
          companyId,
          tripIds: [params.tripId, ...(read.pickupTripId === null ? [] : [read.pickupTripId])],
        })
        const targetStatus = tripStatuses.get(params.tripId)
        if (targetStatus === undefined) throw new TripNotFoundError()

        const pickup = await readPickup(transaction, { ...params, lock: true })
        if (pickup === null || !samePickup(read, pickup)) throw new CanhotoPickupChangedError()

        const decision = decideCanhotoPickupSchedule({
          hasOriginAddress: pickup.originStopId !== null,
          originTripId: pickup.originTripId,
          pickupStatus: pickup.status,
          pickupTripId: pickup.pickupTripId,
          targetTripId: params.tripId,
          targetTripStatus: targetStatus,
        })
        if (decision.kind === 'refuse') throw new CanhotoPickupScheduleRefusedError(decision.reason)
        if (decision.kind === 'unchanged') {
          return { pickup: await readPickupView(transaction, params), tripsToRefreeze: [] }
        }

        const tripsToRefreeze = new Set<string>()
        if (decision.detachFromTripId !== null) {
          await detachPickup(transaction, { companyId, pickup, tripStatuses, tripsToRefreeze })
        }
        const stopId = await reconcilePickupStop(transaction, {
          companyId,
          originStopId: pickup.originStopId ?? '',
          tripId: params.tripId,
          tripStatus: targetStatus,
          tripsToRefreeze,
        })
        await transaction
          .update(tripCanhotoPickups)
          .set({
            pickupStopId: stopId,
            pickupTripId: params.tripId,
            status: 'scheduled',
            updatedAt: sql`now()`,
          })
          .where(
            and(eq(tripCanhotoPickups.companyId, companyId), eq(tripCanhotoPickups.id, pickup.id)),
          )
        await recordAudit(transaction, {
          ...params,
          action: 'scheduled',
          after: { pickupStopId: stopId, pickupTripId: params.tripId },
          before: pickup,
        })
        return {
          pickup: await readPickupView(transaction, params),
          tripsToRefreeze: [...tripsToRefreeze],
        }
      })
    },

    async unschedule(params): Promise<CanhotoPickupWriteResult> {
      const { companyId } = params
      const read = await readPickup(database, { ...params, lock: false })
      if (read === null) throw new CanhotoPickupNotFoundError()
      if (read.status !== 'scheduled' || read.pickupTripId === null) {
        throw new CanhotoPickupNotScheduledError()
      }
      const pickupTripId = read.pickupTripId

      return database.transaction(async (transaction) => {
        const tripStatuses = await lockTrips(transaction, { companyId, tripIds: [pickupTripId] })
        const pickup = await readPickup(transaction, { ...params, lock: true })
        if (pickup === null || !samePickup(read, pickup)) throw new CanhotoPickupChangedError()

        const tripsToRefreeze = new Set<string>()
        await detachPickup(transaction, { companyId, pickup, tripStatuses, tripsToRefreeze })
        await recordAudit(transaction, {
          ...params,
          action: 'unscheduled',
          after: { pickupStopId: null, pickupTripId: null },
          before: pickup,
        })
        return {
          pickup: await readPickupView(transaction, params),
          tripsToRefreeze: [...tripsToRefreeze],
        }
      })
    },
  }
}
