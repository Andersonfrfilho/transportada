/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 (plan.md § "Decisão T1.1"): a escrita da transferência, na ordem que o lock pede. Tudo
 * roda na transação do repositório, sob `SELECT trips … FOR NO KEY UPDATE`, e **em sequência** — o
 * Bun SQL deixa a transação ociosa quando consultas disputam a conexão dela.
 */
import { and, asc, eq } from 'drizzle-orm'

import { tripDrivers, trips } from '../../database/trip.schema.js'
import type {
  TransferTripCrewParams,
  TripCrewTransferSummary,
} from '../application/trip-crew-transfer.types.js'
import {
  buildCrewCostDifference,
  type CrewCostDifference,
} from '../domain/trip-crew-cost.policy.js'
import {
  summarizeRosterCost,
  type TripCrewCostFigures,
} from '../domain/trip-crew-transfer-cost.policy.js'
import { hasDriverSetChanged, isCrewRequestUnchanged } from '../domain/trip-crew-transfer.policy.js'
import { TRIP_ACTION, checkTripTransition } from '../domain/trip-state.policy.js'
import { TripCrewUnchangedError, TripStateTransitionNotAllowedError } from '../domain/trip.error.js'
import type { TripDriverLine } from '../domain/trip.policy.js'
import { readCrewCostBasis } from './trip-crew-cost.query.js'
import type { TripTransaction } from './trip-queryable.type.js'
import {
  hasAuthorizedManifest,
  recordAudit,
  recordCrewEvent,
  replaceCrew,
} from './trip-crew-transfer-write.persistence.js'

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
