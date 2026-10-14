/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A nota retirada de uma viagem ainda no barracão como fonte da linha do tempo
 * (`trip_document_release_events`): quem retirou, de qual parada e por quê. Escopada por `company_id`
 * em cada junção (`test/trip-schema/trip-timeline-query-tenant-safety.contract.ts`).
 */
import { and, eq } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { nfeDocuments } from '../../database/nfe.schema.js'
import { tripDocumentReleaseEvents, tripDocuments } from '../../database/trip.schema.js'
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

export async function listDocumentReleasedRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const priorityExpr = constantPriority('document.released')
  const conditions: SQL[] = [
    eq(tripDocumentReleaseEvents.companyId, params.companyId),
    eq(tripDocumentReleaseEvents.tripId, params.tripId),
  ]
  if (params.documentId !== undefined) {
    conditions.push(eq(tripDocumentReleaseEvents.tripDocumentId, params.documentId))
  }
  if (params.cursor !== null) {
    conditions.push(
      timelineKeysetCondition(
        tripDocumentReleaseEvents.createdAt,
        priorityExpr,
        tripDocumentReleaseEvents.id,
        params.cursor,
      ),
      timelineIndexablePredicate(tripDocumentReleaseEvents.createdAt, params.cursor),
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      channel: tripDocumentReleaseEvents.channel,
      documentId: tripDocumentReleaseEvents.tripDocumentId,
      id: tripDocumentReleaseEvents.id,
      invoiceNumber: nfeDocuments.number,
      invoiceSeries: nfeDocuments.series,
      isSystemActor: timelineActorIsSystem,
      note: tripDocumentReleaseEvents.note,
      occurredAt: tripDocumentReleaseEvents.createdAt,
      occurredAtKey: formatTimelineTimestampKey(tripDocumentReleaseEvents.createdAt),
      scope: tripDocumentReleaseEvents.scope,
      stopLabel: tripDocumentReleaseEvents.stopLabel,
    })
    .from(tripDocumentReleaseEvents)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentReleaseEvents.companyId),
        eq(tripDocuments.id, tripDocumentReleaseEvents.tripDocumentId),
      ),
    )
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .leftJoin(
      timelineActorMembership,
      and(
        eq(timelineActorMembership.companyId, tripDocumentReleaseEvents.companyId),
        eq(timelineActorMembership.userId, tripDocumentReleaseEvents.actorUserId),
        eq(timelineActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(timelineActorProfile, eq(timelineActorProfile.userId, timelineActorMembership.userId))
    .where(and(...conditions))
    .orderBy(
      ...timelineOrderExpression(
        tripDocumentReleaseEvents.createdAt,
        priorityExpr,
        tripDocumentReleaseEvents.id,
      ),
    )
    .limit(params.limit + 1)

  return rows.map((row) => ({
    actorName: row.actorName ?? null,
    isSystemActor: row.isSystemActor,
    channel: row.channel,
    closeReason: null,
    document: { id: row.documentId, number: row.invoiceNumber, series: row.invoiceSeries },
    documentRelease: { note: row.note, scope: row.scope, stopLabel: row.stopLabel },
    fromStatus: null,
    id: row.id,
    kind: 'document.released' as const,
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
