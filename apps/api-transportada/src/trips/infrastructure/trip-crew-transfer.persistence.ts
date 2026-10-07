/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 (plan.md § "Decisão T1.1"): a escrita da transferência, na ordem que o lock pede. Tudo
 * roda na transação do repositório, sob `SELECT trips … FOR NO KEY UPDATE`, e **em sequência** — o
 * Bun SQL deixa a transação ociosa quando consultas disputam a conexão dela.
 */
import { and, asc, eq, sql } from 'drizzle-orm'

import { auditLogs } from '../../database/database.schema.js'
import { mdfeManifests } from '../../database/mdfe.schema.js'
import { tripCrewEvents, tripDrivers, trips } from '../../database/trip.schema.js'
import type {
  TransferTripCrewParams,
  TripCrewTransferSummary,
} from '../application/trip-crew-transfer.types.js'
import {
  buildCrewCostDifference,
  type CrewCostDifference,
} from '../domain/trip-crew-cost.policy.js'
import {
  TRIP_AUDIT_ENTITY_TYPE,
  TRIP_CREW_TRANSFER_AUDIT_ACTION,
} from '../domain/trip-crew-transfer.constant.js'
import {
  summarizeRosterCost,
  type TripCrewCostFigures,
} from '../domain/trip-crew-transfer-cost.policy.js'
import {
  buildCrewSnapshot,
  hasDriverSetChanged,
  isCrewRequestUnchanged,
} from '../domain/trip-crew-transfer.policy.js'
import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '../domain/trip-permission.constant.js'
import { TRIP_ACTION, checkTripTransition } from '../domain/trip-state.policy.js'
import { TripCrewUnchangedError, TripStateTransitionNotAllowedError } from '../domain/trip.error.js'
import type { TripDriverLine } from '../domain/trip.policy.js'
import { readCrewCostBasis } from './trip-crew-cost.query.js'
import type { TripTransaction } from './trip-queryable.type.js'

const AUTHORIZED_MANIFEST_STATUS = 'authorized'

/**
 * `null` é viagem inexistente nesta empresa. Não toca em `trips` além de `updated_at` — `status`,
 * `vehicle_id`, rota congelada, pedágio e ETA ficam como estavam (D2) — e não grava
 * `trip_status_events`, porque nenhum status muda.
 */
export async function applyTripCrewTransfer(
  transaction: TripTransaction,
  params: TransferTripCrewParams,
): Promise<TripCrewTransferSummary | null> {
  const figures = await lockTripAndCheckWindow(transaction, params)
  if (figures === null) return null

  const previousCrew = await readCurrentCrew(transaction, params)
  if (isCrewRequestUnchanged({ current: previousCrew, requested: params.crew })) {
    throw new TripCrewUnchangedError()
  }

  const cost = await measureCostDifference(transaction, { figures, params, previousCrew })
  await replaceCrew(transaction, params)

  const mdfeDriverDivergence =
    hasDriverSetChanged({ next: params.crew, previous: previousCrew }) &&
    (await hasAuthorizedManifest(transaction, params))
  const eventId = await recordCrewEvent(transaction, {
    cost,
    mdfeDriverDivergence,
    params,
    previousCrew,
  })
  await recordAudit(transaction, { eventId, mdfeDriverDivergence, params, previousCrew })

  return { ...cost, id: eventId, mdfeDriverDivergence }
}

/**
 * O status que o caso de uso leu é anterior ao lock; só este vale (ADR-0068, defeito 29). Devolve os
 * insumos da conta de custo que a mesma leitura travada trouxe.
 */
async function lockTripAndCheckWindow(
  transaction: TripTransaction,
  { companyId, tripId }: TransferTripCrewParams,
): Promise<TripCrewCostFigures | null> {
  const [trip] = await transaction
    .select({
      dailyAllowanceDays: trips.dailyAllowanceDays,
      estimatedDurationSeconds: trips.plannedDurationSeconds,
      journeyIncludesReturn: trips.plannedJourneyIncludesReturn,
      journeySeconds: trips.plannedJourneySeconds,
      status: trips.status,
    })
    .from(trips)
    .where(and(eq(trips.companyId, companyId), eq(trips.id, tripId)))
    .for('no key update')
    .limit(1)
  if (trip === undefined) return null

  const transition = checkTripTransition({
    action: TRIP_ACTION.transferCrew,
    hasRoute: false,
    tripStatus: trip.status,
  })
  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }

  return {
    dailyAllowanceDays: trip.dailyAllowanceDays,
    estimatedDurationSeconds: trip.estimatedDurationSeconds,
    journeyIncludesReturn: trip.journeyIncludesReturn,
    journeySeconds: trip.journeySeconds,
  }
}

async function readCurrentCrew(
  transaction: TripTransaction,
  { companyId, tripId }: TransferTripCrewParams,
): Promise<readonly TripDriverLine[]> {
  const rows = await transaction
    .select({
      driverId: tripDrivers.driverId,
      driverName: tripDrivers.driverName,
      driverTaxId: tripDrivers.driverTaxId,
      position: tripDrivers.position,
      role: tripDrivers.role,
    })
    .from(tripDrivers)
    .where(and(eq(tripDrivers.companyId, companyId), eq(tripDrivers.tripId, tripId)))
    .orderBy(asc(tripDrivers.position))

  return rows.map((row) => ({ ...row, position: Number(row.position) }))
}

type MeasureCostDifferenceParams = {
  readonly figures: TripCrewCostFigures
  readonly params: TransferTripCrewParams
  readonly previousCrew: readonly TripDriverLine[]
}

/** Antes e depois saem da mesma leitura das fichas, sob o lock — nunca de duas fotografias. */
async function measureCostDifference(
  transaction: TripTransaction,
  { figures, params, previousCrew }: MeasureCostDifferenceParams,
): Promise<CrewCostDifference> {
  const basis = await readCrewCostBasis(transaction, {
    companyId: params.companyId,
    driverIds: [...new Set([...previousCrew, ...params.crew].map((member) => member.driverId))],
    trip: figures,
  })

  return buildCrewCostDifference({
    after: summarizeRosterCost({ basis, roster: params.crew }),
    before: summarizeRosterCost({ basis, roster: previousCrew }),
  })
}

async function replaceCrew(
  transaction: TripTransaction,
  { companyId, crew, tripId }: TransferTripCrewParams,
): Promise<void> {
  await transaction
    .delete(tripDrivers)
    .where(and(eq(tripDrivers.companyId, companyId), eq(tripDrivers.tripId, tripId)))
  await transaction.insert(tripDrivers).values(
    crew.map((member) => ({
      companyId,
      driverId: member.driverId,
      driverName: member.driverName,
      driverTaxId: member.driverTaxId,
      position: BigInt(member.position),
      role: member.role,
      tripId,
    })),
  )
  await transaction
    .update(trips)
    .set({ updatedAt: sql`now()` })
    .where(and(eq(trips.companyId, companyId), eq(trips.id, tripId)))
}

async function hasAuthorizedManifest(
  transaction: TripTransaction,
  { companyId, tripId }: TransferTripCrewParams,
): Promise<boolean> {
  const [manifest] = await transaction
    .select({ id: mdfeManifests.id })
    .from(mdfeManifests)
    .where(
      and(
        eq(mdfeManifests.companyId, companyId),
        eq(mdfeManifests.tripId, tripId),
        eq(mdfeManifests.status, AUTHORIZED_MANIFEST_STATUS),
      ),
    )
    .limit(1)
  return manifest !== undefined
}

type RecordCrewEventParams = {
  readonly cost: CrewCostDifference
  readonly mdfeDriverDivergence: boolean
  readonly params: TransferTripCrewParams
  readonly previousCrew: readonly TripDriverLine[]
}

async function recordCrewEvent(
  transaction: TripTransaction,
  { cost, mdfeDriverDivergence, params, previousCrew }: RecordCrewEventParams,
): Promise<string> {
  const [event] = await transaction
    .insert(tripCrewEvents)
    .values({
      actorUserId: params.actorUserId,
      channel: params.channel,
      companyId: params.companyId,
      costAfter: cost.costAfter,
      costBefore: cost.costBefore,
      costDifference: cost.costDifference,
      costHasGaps: cost.costHasGaps,
      /** `now()` é o início da transação: duas transferências serializadas pelo lock sairiam fora de ordem. */
      createdAt: sql`clock_timestamp()`,
      mdfeDriverDivergence,
      nextCrew: buildCrewSnapshot(params.crew),
      previousCrew: buildCrewSnapshot(previousCrew),
      reason: params.reason,
      tripId: params.tripId,
    })
    .returning({ id: tripCrewEvents.id })
  if (event === undefined) throw new Error('TRIP_CREW_EVENT_NOT_RECORDED')
  return event.id
}

type RecordAuditParams = {
  readonly eventId: string
  readonly mdfeDriverDivergence: boolean
  readonly params: TransferTripCrewParams
  readonly previousCrew: readonly TripDriverLine[]
}

/**
 * `security.md` §10: ação sensível — troca quem responde pela carga. O motivo e os nomes são dado de
 * negócio e nunca entram em `metadata`; só ids opacos, a divergência de MDF-e e o IP.
 */
async function recordAudit(
  transaction: TripTransaction,
  { eventId, mdfeDriverDivergence, params, previousCrew }: RecordAuditParams,
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: TRIP_CREW_TRANSFER_AUDIT_ACTION,
    actorUserId: params.actorUserId,
    companyId: params.companyId,
    correlationId: params.correlationId,
    entityId: params.tripId,
    entityType: TRIP_AUDIT_ENTITY_TYPE,
    metadata: {
      crewEventId: eventId,
      ipAddress: params.ipAddress,
      mdfeDriverDivergence,
      nextDriverIds: params.crew.map((member) => member.driverId),
      previousDriverIds: previousCrew.map((member) => member.driverId),
    },
    permission: TRIP_REPORT_ON_BEHALF_PERMISSION,
    targetId: params.tripId,
    targetType: TRIP_AUDIT_ENTITY_TYPE,
  })
}
