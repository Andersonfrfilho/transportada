/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5/T9: duas das seis fontes da linha do tempo — `trip_stop_events` (D5: cobre os três
 * `kind`s `arrived`/`delivered`/`returned`) e `trip_stop_occurrences`. Escopadas por `company_id` em
 * cada junção.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  tripDocuments,
  tripStopEvents,
  tripStopOccurrences,
  tripStops,
} from '../../database/trip.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { TRIP_TIMELINE_KIND_PRIORITY } from '../application/trip-timeline.types.js'
import { resolveRecordedAt } from '../application/trip-timeline-merge.service.js'
import type { TripTimelineRow } from '../application/trip-timeline-merge.service.js'
import type {
  ReadTripTimelineParams,
  TripTimelineKind,
} from '../application/trip-timeline.types.js'
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

const STOP_EVENT_KIND_TO_TIMELINE_KIND = {
  arrived: 'stop.arrived',
  delivered: 'document.delivered',
  returned: 'document.returned',
} as const satisfies Record<string, TripTimelineKind>

export async function listStopEventRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const priorityExpr = sql`case ${tripStopEvents.kind}
    when 'arrived' then ${TRIP_TIMELINE_KIND_PRIORITY['stop.arrived']}
    when 'delivered' then ${TRIP_TIMELINE_KIND_PRIORITY['document.delivered']}
    else ${TRIP_TIMELINE_KIND_PRIORITY['document.returned']}
  end::int`
  const conditions: SQL[] = [
    eq(tripStopEvents.companyId, params.companyId),
    eq(tripStops.tripId, params.tripId),
    inArray(tripStopEvents.kind, ['arrived', 'delivered', 'returned']),
  ]
  if (params.cursor !== null) {
    conditions.push(
      timelineKeysetCondition(
        tripStopEvents.createdAt,
        priorityExpr,
        tripStopEvents.id,
        params.cursor,
      ),
      timelineIndexablePredicate(tripStopEvents.createdAt, params.cursor),
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      channel: tripStopEvents.channel,
      documentId: tripDocuments.id,
      id: tripStopEvents.id,
      invoiceNumber: nfeDocuments.number,
      invoiceSeries: nfeDocuments.series,
      kind: tripStopEvents.kind,
      occurredAt: tripStopEvents.createdAt,
      occurredAtKey: formatTimelineTimestampKey(tripStopEvents.createdAt),
      onBehalfOfDriverName: timelineOnBehalfDriver.name,
      recordedAt: tripStopEvents.recordedAt,
      returnReason: tripDocuments.returnReason,
      stopId: tripStops.id,
      stopSequence: tripStops.sequence,
    })
    .from(tripStopEvents)
    .innerJoin(
      tripStops,
      and(
        eq(tripStops.companyId, tripStopEvents.companyId),
        eq(tripStops.id, tripStopEvents.stopId),
      ),
    )
    .leftJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripStopEvents.companyId),
        eq(tripDocuments.id, tripStopEvents.tripDocumentId),
      ),
    )
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripStopEvents.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .leftJoin(
      timelineActorMembership,
      and(
        eq(timelineActorMembership.companyId, tripStopEvents.companyId),
        eq(timelineActorMembership.userId, tripStopEvents.actorUserId),
        eq(timelineActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(timelineActorProfile, eq(timelineActorProfile.userId, timelineActorMembership.userId))
    .leftJoin(
      timelineOnBehalfDriver,
      and(
        eq(timelineOnBehalfDriver.companyId, tripStopEvents.companyId),
        eq(timelineOnBehalfDriver.id, tripStopEvents.onBehalfOfDriverId),
      ),
    )
    .where(and(...conditions))
    .orderBy(...timelineOrderExpression(tripStopEvents.createdAt, priorityExpr, tripStopEvents.id))
    .limit(params.limit + 1)

  return rows.map((row) => ({
    actorName: row.actorName ?? null,
    channel: row.channel,
    closeReason: null,
    document:
      row.documentId === null
        ? null
        : { id: row.documentId, number: row.invoiceNumber, series: row.invoiceSeries },
    fromStatus: null,
    id: row.id,
    kind: STOP_EVENT_KIND_TO_TIMELINE_KIND[
      row.kind as keyof typeof STOP_EVENT_KIND_TO_TIMELINE_KIND
    ],
    occurrence: null,
    occurredAt: row.occurredAt,
    occurredAtKey: row.occurredAtKey,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    recordedAt: resolveRecordedAt(row.channel, row.occurredAt, row.recordedAt),
    returnReason: row.kind === 'returned' ? (row.returnReason ?? null) : null,
    stop: { id: row.stopId, sequence: Number(row.stopSequence) },
    toStatus: null,
  }))
}

export async function listStopOccurrenceRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const priorityExpr = constantPriority('stop.occurrence')
  const conditions: SQL[] = [
    eq(tripStopOccurrences.companyId, params.companyId),
    eq(tripStops.tripId, params.tripId),
  ]
  if (params.cursor !== null) {
    conditions.push(
      timelineKeysetCondition(
        tripStopOccurrences.createdAt,
        priorityExpr,
        tripStopOccurrences.id,
        params.cursor,
      ),
      timelineIndexablePredicate(tripStopOccurrences.createdAt, params.cursor),
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      channel: tripStopOccurrences.channel,
      description: tripStopOccurrences.description,
      id: tripStopOccurrences.id,
      kind: tripStopOccurrences.kind,
      occurredAt: tripStopOccurrences.createdAt,
      occurredAtKey: formatTimelineTimestampKey(tripStopOccurrences.createdAt),
      onBehalfOfDriverName: timelineOnBehalfDriver.name,
      stopId: tripStops.id,
      stopSequence: tripStops.sequence,
    })
    .from(tripStopOccurrences)
    .innerJoin(
      tripStops,
      and(
        eq(tripStops.companyId, tripStopOccurrences.companyId),
        eq(tripStops.id, tripStopOccurrences.stopId),
      ),
    )
    .leftJoin(
      timelineActorMembership,
      and(
        eq(timelineActorMembership.companyId, tripStopOccurrences.companyId),
        eq(timelineActorMembership.userId, tripStopOccurrences.actorUserId),
        eq(timelineActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(timelineActorProfile, eq(timelineActorProfile.userId, timelineActorMembership.userId))
    .leftJoin(
      timelineOnBehalfDriver,
      and(
        eq(timelineOnBehalfDriver.companyId, tripStopOccurrences.companyId),
        eq(timelineOnBehalfDriver.id, tripStopOccurrences.onBehalfOfDriverId),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      ...timelineOrderExpression(
        tripStopOccurrences.createdAt,
        priorityExpr,
        tripStopOccurrences.id,
      ),
    )
    .limit(params.limit + 1)

  return rows.map((row) => ({
    actorName: row.actorName ?? null,
    channel: row.channel,
    closeReason: null,
    document: null,
    fromStatus: null,
    id: row.id,
    kind: 'stop.occurrence' as const,
    occurrence: { note: row.description, typeName: row.kind },
    occurredAt: row.occurredAt,
    occurredAtKey: row.occurredAtKey,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    recordedAt: null,
    returnReason: null,
    stop: { id: row.stopId, sequence: Number(row.stopSequence) },
    toStatus: null,
  }))
}
