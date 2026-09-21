/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5/T9: duas das seis fontes da linha do tempo — o despacho (`trip_dispatch_snapshots`) e
 * a troca de status da viagem (`trip_status_events`). Escopadas por `company_id` **em cada junção**
 * (`test/trip-schema/trip-timeline-query-tenant-safety.contract.ts`).
 */
import { and, eq } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { trips, tripDispatchSnapshots, tripStatusEvents } from '../../database/trip.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { resolveRecordedAt } from '../application/trip-timeline-merge.service.js'
import type { TripTimelineRow } from '../application/trip-timeline-merge.service.js'
import type { ReadTripTimelineParams } from '../application/trip-timeline.types.js'
import type { TripQueryable } from './trip-queryable.type.js'
import {
  constantPriority,
  formatTimelineTimestampKey,
  timelineActorMembership,
  timelineActorProfile,
  timelineIndexablePredicate,
  timelineKeysetCondition,
  timelineOnBehalfDriver,
  timelineOrderExpression,
} from './trip-timeline-condition.helper.js'

export async function listDispatchedRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const priorityExpr = constantPriority('trip.dispatched')
  const conditions: SQL[] = [
    eq(tripDispatchSnapshots.companyId, params.companyId),
    eq(tripDispatchSnapshots.tripId, params.tripId),
  ]
  if (params.cursor !== null) {
    conditions.push(
      timelineKeysetCondition(
        tripDispatchSnapshots.dispatchedAt,
        priorityExpr,
        tripDispatchSnapshots.id,
        params.cursor,
      ),
      timelineIndexablePredicate(tripDispatchSnapshots.dispatchedAt, params.cursor),
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      id: tripDispatchSnapshots.id,
      occurredAt: tripDispatchSnapshots.dispatchedAt,
      occurredAtKey: formatTimelineTimestampKey(tripDispatchSnapshots.dispatchedAt),
    })
    .from(tripDispatchSnapshots)
    .leftJoin(
      timelineActorMembership,
      and(
        eq(timelineActorMembership.companyId, tripDispatchSnapshots.companyId),
        eq(timelineActorMembership.userId, tripDispatchSnapshots.actorUserId),
        eq(timelineActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(timelineActorProfile, eq(timelineActorProfile.userId, timelineActorMembership.userId))
    .where(and(...conditions))
    .orderBy(
      ...timelineOrderExpression(
        tripDispatchSnapshots.dispatchedAt,
        priorityExpr,
        tripDispatchSnapshots.id,
      ),
    )
    .limit(params.limit + 1)

  return rows.map((row) => ({
    actorName: row.actorName ?? null,
    channel: null,
    closeReason: null,
    document: null,
    fromStatus: null,
    id: row.id,
    kind: 'trip.dispatched' as const,
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

export async function listStatusChangedRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const priorityExpr = constantPriority('trip.status_changed')
  const conditions: SQL[] = [
    eq(tripStatusEvents.companyId, params.companyId),
    eq(tripStatusEvents.tripId, params.tripId),
  ]
  if (params.cursor !== null) {
    conditions.push(
      timelineKeysetCondition(
        tripStatusEvents.occurredAt,
        priorityExpr,
        tripStatusEvents.id,
        params.cursor,
      ),
      timelineIndexablePredicate(tripStatusEvents.occurredAt, params.cursor),
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      channel: tripStatusEvents.channel,
      closeReason: trips.closeReason,
      fromStatus: tripStatusEvents.fromStatus,
      id: tripStatusEvents.id,
      occurredAt: tripStatusEvents.occurredAt,
      occurredAtKey: formatTimelineTimestampKey(tripStatusEvents.occurredAt),
      onBehalfOfDriverName: timelineOnBehalfDriver.name,
      recordedAt: tripStatusEvents.recordedAt,
      toStatus: tripStatusEvents.toStatus,
    })
    .from(tripStatusEvents)
    .innerJoin(
      trips,
      and(eq(trips.companyId, tripStatusEvents.companyId), eq(trips.id, tripStatusEvents.tripId)),
    )
    .leftJoin(
      timelineActorMembership,
      and(
        eq(timelineActorMembership.companyId, tripStatusEvents.companyId),
        eq(timelineActorMembership.userId, tripStatusEvents.actorUserId),
        eq(timelineActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(timelineActorProfile, eq(timelineActorProfile.userId, timelineActorMembership.userId))
    .leftJoin(
      timelineOnBehalfDriver,
      and(
        eq(timelineOnBehalfDriver.companyId, tripStatusEvents.companyId),
        eq(timelineOnBehalfDriver.id, tripStatusEvents.onBehalfOfDriverId),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      ...timelineOrderExpression(tripStatusEvents.occurredAt, priorityExpr, tripStatusEvents.id),
    )
    .limit(params.limit + 1)

  return rows.map((row) => ({
    actorName: row.actorName ?? null,
    channel: row.channel,
    /**
     * Spec 158 T12: `trips.close_reason` só descreve o encerramento manual — em qualquer outro
     * `toStatus` ele é ruído da mesma viagem, nunca o motivo daquele evento.
     */
    closeReason: row.toStatus === 'completed' ? row.closeReason : null,
    document: null,
    fromStatus: row.fromStatus,
    id: row.id,
    kind: 'trip.status_changed' as const,
    occurrence: null,
    occurredAt: row.occurredAt,
    occurredAtKey: row.occurredAtKey,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    recordedAt: resolveRecordedAt(row.channel, row.occurredAt, row.recordedAt),
    returnReason: null,
    stop: null,
    toStatus: row.toStatus,
  }))
}
