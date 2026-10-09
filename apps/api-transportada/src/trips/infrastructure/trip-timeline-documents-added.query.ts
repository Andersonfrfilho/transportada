/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 257 D9: as notas acrescentadas à viagem na rua como fonte da linha do tempo (`trip_document_link_events`).
 * Escopada por `company_id` em cada junção (`test/trip-schema/trip-timeline-query-tenant-safety.contract.ts`).
 */
import { and, eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { tripDocumentLinkEvents } from '../../database/trip.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import type { TripTimelineRow } from '../application/trip-timeline-merge.service.js'
import { NO_EVENT_LOCATION } from '../application/trip-timeline.types.js'
import type { ReadTripTimelineParams } from '../application/trip-timeline.types.js'
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

export async function listDocumentsAddedRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const priorityExpr = constantPriority('documents_added')
  const conditions: SQL[] = [
    eq(tripDocumentLinkEvents.companyId, params.companyId),
    eq(tripDocumentLinkEvents.tripId, params.tripId),
  ]
  if (params.cursor !== null) {
    conditions.push(
      timelineKeysetCondition(
        tripDocumentLinkEvents.createdAt,
        priorityExpr,
        tripDocumentLinkEvents.id,
        params.cursor,
      ),
      timelineIndexablePredicate(tripDocumentLinkEvents.createdAt, params.cursor),
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      isSystemActor: timelineActorIsSystem,
      channel: tripDocumentLinkEvents.channel,
      documentCount:
        sql<number>`jsonb_array_length(${tripDocumentLinkEvents.nfeDocumentIds})`.mapWith(Number),
      documentsWithoutCte: tripDocumentLinkEvents.documentsWithoutCte,
      id: tripDocumentLinkEvents.id,
      mdfeDocumentDivergence: tripDocumentLinkEvents.mdfeDocumentDivergence,
      occurredAt: tripDocumentLinkEvents.createdAt,
      occurredAtKey: formatTimelineTimestampKey(tripDocumentLinkEvents.createdAt),
      reason: tripDocumentLinkEvents.reason,
    })
    .from(tripDocumentLinkEvents)
    .leftJoin(
      timelineActorMembership,
      and(
        eq(timelineActorMembership.companyId, tripDocumentLinkEvents.companyId),
        eq(timelineActorMembership.userId, tripDocumentLinkEvents.actorUserId),
        eq(timelineActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(timelineActorProfile, eq(timelineActorProfile.userId, timelineActorMembership.userId))
    .where(and(...conditions))
    .orderBy(
      ...timelineOrderExpression(
        tripDocumentLinkEvents.createdAt,
        priorityExpr,
        tripDocumentLinkEvents.id,
      ),
    )
    .limit(params.limit + 1)

  return rows.map((row) => ({
    actorName: row.actorName ?? null,
    isSystemActor: row.isSystemActor,
    channel: row.channel,
    closeReason: null,
    document: null,
    documentsAdded: {
      documentCount: row.documentCount,
      documentsWithoutCte: row.documentsWithoutCte,
      mdfeDocumentDivergence: row.mdfeDocumentDivergence,
      reason: row.reason,
    },
    fromStatus: null,
    id: row.id,
    kind: 'documents_added' as const,
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
