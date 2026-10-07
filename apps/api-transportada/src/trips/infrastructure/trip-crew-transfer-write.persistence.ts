/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249: as escritas da transferência — a troca de `trip_drivers`, o histórico e a auditoria. Rodam
 * na transação e **sob o lock** de `applyTripCrewTransfer`, em sequência.
 */
import { and, eq, sql } from 'drizzle-orm'

import { auditLogs } from '../../database/database.schema.js'
import { mdfeManifests } from '../../database/mdfe.schema.js'
import { tripCrewEvents, tripDrivers, trips } from '../../database/trip.schema.js'
import type { TransferTripCrewParams } from '../application/trip-crew-transfer.types.js'
import type { CrewCostDifference } from '../domain/trip-crew-cost.policy.js'
import {
  TRIP_AUDIT_ENTITY_TYPE,
  TRIP_CREW_TRANSFER_AUDIT_ACTION,
} from '../domain/trip-crew-transfer.constant.js'
import { buildCrewSnapshot } from '../domain/trip-crew-transfer.policy.js'
import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '../domain/trip-permission.constant.js'
import type { TripDriverLine } from '../domain/trip.policy.js'
import type { TripTransaction } from './trip-queryable.type.js'

const AUTHORIZED_MANIFEST_STATUS = 'authorized'

export async function replaceCrew(
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

export async function hasAuthorizedManifest(
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

export type RecordCrewEventParams = {
  readonly cost: CrewCostDifference
  readonly mdfeDriverDivergence: boolean
  readonly params: TransferTripCrewParams
  readonly previousCrew: readonly TripDriverLine[]
}

export async function recordCrewEvent(
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

export type RecordAuditParams = {
  readonly eventId: string
  readonly mdfeDriverDivergence: boolean
  readonly params: TransferTripCrewParams
  readonly previousCrew: readonly TripDriverLine[]
}

/**
 * `security.md` §10: ação sensível — troca quem responde pela carga. O motivo e os nomes são dado de
 * negócio e nunca entram em `metadata`; só ids opacos, a divergência de MDF-e e o IP.
 */
export async function recordAudit(
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
