/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 D6: a transferência de tripulação como fonte da linha do tempo (`trip_crew_events`).
 * Escopada por `company_id` em cada junção (`test/trip-schema/trip-timeline-query-tenant-safety.contract.ts`).
 */
import { and, eq } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { tripCrewEvents } from '../../database/trip.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import type { TripTimelineRow } from '../application/trip-timeline-merge.service.js'
import { NO_EVENT_LOCATION } from '../application/trip-timeline.types.js'
import type { ReadTripTimelineParams } from '../application/trip-timeline.types.js'
import { parseCrewSnapshot } from '../domain/trip-crew-transfer.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'
import {
  constantPriority,
  formatTimelineTimestampKey,
  timelineActorMembership,
  timelineActorIsSystem,
  timelineActorProfile,
  timelineIndexablePredicate,
  timelineKeysetCondition,
  timelineOrderExpression,
} from './trip-timeline-condition.helper.js'

export async function listCrewTransferRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const priorityExpr = constantPriority('crew_transfer')
  const conditions: SQL[] = [
    eq(tripCrewEvents.companyId, params.companyId),
    eq(tripCrewEvents.tripId, params.tripId),
  ]
  if (params.cursor !== null) {
    conditions.push(
      timelineKeysetCondition(
        tripCrewEvents.createdAt,
        priorityExpr,
        tripCrewEvents.id,
        params.cursor,
      ),
      timelineIndexablePredicate(tripCrewEvents.createdAt, params.cursor),
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      isSystemActor: timelineActorIsSystem,
      channel: tripCrewEvents.channel,
      costDifference: tripCrewEvents.costDifference,
      id: tripCrewEvents.id,
      mdfeDriverDivergence: tripCrewEvents.mdfeDriverDivergence,
      nextCrew: tripCrewEvents.nextCrew,
      occurredAt: tripCrewEvents.createdAt,
      occurredAtKey: formatTimelineTimestampKey(tripCrewEvents.createdAt),
      previousCrew: tripCrewEvents.previousCrew,
      reason: tripCrewEvents.reason,
    })
    .from(tripCrewEvents)
    .leftJoin(
      timelineActorMembership,
      and(
        eq(timelineActorMembership.companyId, tripCrewEvents.companyId),
        eq(timelineActorMembership.userId, tripCrewEvents.actorUserId),
        eq(timelineActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(timelineActorProfile, eq(timelineActorProfile.userId, timelineActorMembership.userId))
    .where(and(...conditions))
    .orderBy(...timelineOrderExpression(tripCrewEvents.createdAt, priorityExpr, tripCrewEvents.id))
    .limit(params.limit + 1)

  return rows.map((row) => ({
    actorName: row.actorName ?? null,
    isSystemActor: row.isSystemActor,
    channel: row.channel,
    closeReason: null,
    crewTransfer: {
      costDifference: row.costDifference,
      mdfeDriverDivergence: row.mdfeDriverDivergence,
      nextCrew: parseCrewSnapshot(row.nextCrew),
      previousCrew: parseCrewSnapshot(row.previousCrew),
      reason: row.reason,
    },
    document: null,
    fromStatus: null,
    id: row.id,
    kind: 'crew_transfer' as const,
    lateRegistration: false,
    ...NO_EVENT_LOCATION,
    occurrence: null,
    occurredAt: row.occurredAt,
    occurredAtKey: row.occurredAtKey,
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: null,
    toStatus: null,
  }))
}
