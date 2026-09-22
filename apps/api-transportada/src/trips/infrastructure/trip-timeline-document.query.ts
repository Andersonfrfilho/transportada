/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5/T9: duas das seis fontes da linha do tempo — `trip_document_occurrences` e
 * `trip_document_events` (D3, ADR-0068 §4: o motorista nunca grava nessa tabela, `channel =
 * 'driver_app'` ali significa "canal não registrado" — sai como `channel: null`). Escopadas por
 * `company_id` em cada junção.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  companyOccurrenceTypes,
  tripDocumentEvents,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../database/trip.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { TRIP_FIELD_CHANNELS } from '../domain/trip-field-channel.constant.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
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

export async function listDocumentOccurrenceRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const priorityExpr = constantPriority('document.occurrence')
  const conditions: SQL[] = [
    eq(tripDocumentOccurrences.companyId, params.companyId),
    eq(tripDocuments.tripId, params.tripId),
  ]
  if (params.cursor !== null) {
    conditions.push(
      timelineKeysetCondition(
        tripDocumentOccurrences.createdAt,
        priorityExpr,
        tripDocumentOccurrences.id,
        params.cursor,
      ),
      timelineIndexablePredicate(tripDocumentOccurrences.createdAt, params.cursor),
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      /**
       * Spec 161 T11 (RF12): a contagem da tabela nova (D2) quando existe, senão 1 quando a
       * coluna antiga (D6) tem anexo, senão 0 — o mesmo desempate de RF15, sem trazer nenhuma
       * linha do anexo para a linha do tempo.
       */
      attachmentCount: sql<number>`(
        case
          when (
            select count(*) from trip_document_occurrence_attachments
            where company_id = ${tripDocumentOccurrences.companyId}
              and occurrence_id = ${tripDocumentOccurrences.id}
          ) > 0
          then (
            select count(*) from trip_document_occurrence_attachments
            where company_id = ${tripDocumentOccurrences.companyId}
              and occurrence_id = ${tripDocumentOccurrences.id}
          )
          when ${tripDocumentOccurrences.attachmentObjectId} is not null then 1
          else 0
        end
      )`,
      channel: tripDocumentOccurrences.channel,
      documentId: tripDocuments.id,
      id: tripDocumentOccurrences.id,
      invoiceNumber: nfeDocuments.number,
      invoiceSeries: nfeDocuments.series,
      note: tripDocumentOccurrences.note,
      occurredAt: tripDocumentOccurrences.createdAt,
      occurredAtKey: formatTimelineTimestampKey(tripDocumentOccurrences.createdAt),
      onBehalfOfDriverName: timelineOnBehalfDriver.name,
      typeName: companyOccurrenceTypes.name,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
      ),
    )
    .innerJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
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
        eq(timelineActorMembership.companyId, tripDocumentOccurrences.companyId),
        eq(timelineActorMembership.userId, tripDocumentOccurrences.actorUserId),
        eq(timelineActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(timelineActorProfile, eq(timelineActorProfile.userId, timelineActorMembership.userId))
    .leftJoin(
      timelineOnBehalfDriver,
      and(
        eq(timelineOnBehalfDriver.companyId, tripDocumentOccurrences.companyId),
        eq(timelineOnBehalfDriver.id, tripDocumentOccurrences.onBehalfOfDriverId),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      ...timelineOrderExpression(
        tripDocumentOccurrences.createdAt,
        priorityExpr,
        tripDocumentOccurrences.id,
      ),
    )
    .limit(params.limit + 1)

  return rows.map((row) => ({
    actorName: row.actorName ?? null,
    channel: row.channel,
    closeReason: null,
    document: { id: row.documentId, number: row.invoiceNumber, series: row.invoiceSeries },
    fromStatus: null,
    id: row.id,
    kind: 'document.occurrence' as const,
    occurrence: {
      attachmentCount: Number(row.attachmentCount),
      note: row.note,
      typeName: row.typeName,
    },
    occurredAt: row.occurredAt,
    occurredAtKey: row.occurredAtKey,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    recordedAt: null,
    returnReason: null,
    stop: null,
    toStatus: null,
  }))
}

export async function listDocumentStatusChangedRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const priorityExpr = constantPriority('document.status_changed')
  const conditions: SQL[] = [
    eq(tripDocumentEvents.companyId, params.companyId),
    eq(tripDocuments.tripId, params.tripId),
  ]
  if (params.cursor !== null) {
    conditions.push(
      timelineKeysetCondition(
        tripDocumentEvents.occurredAt,
        priorityExpr,
        tripDocumentEvents.id,
        params.cursor,
      ),
      timelineIndexablePredicate(tripDocumentEvents.occurredAt, params.cursor),
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      channel: tripDocumentEvents.channel,
      documentId: tripDocuments.id,
      fromStatus: tripDocumentEvents.fromStatus,
      id: tripDocumentEvents.id,
      invoiceNumber: nfeDocuments.number,
      invoiceSeries: nfeDocuments.series,
      occurredAt: tripDocumentEvents.occurredAt,
      occurredAtKey: formatTimelineTimestampKey(tripDocumentEvents.occurredAt),
      onBehalfOfDriverName: timelineOnBehalfDriver.name,
      recordedAt: tripDocumentEvents.recordedAt,
      toStatus: tripDocumentEvents.toStatus,
    })
    .from(tripDocumentEvents)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentEvents.companyId),
        eq(tripDocuments.id, tripDocumentEvents.tripDocumentId),
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
        eq(timelineActorMembership.companyId, tripDocumentEvents.companyId),
        eq(timelineActorMembership.userId, tripDocumentEvents.actorUserId),
        eq(timelineActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(timelineActorProfile, eq(timelineActorProfile.userId, timelineActorMembership.userId))
    .leftJoin(
      timelineOnBehalfDriver,
      and(
        eq(timelineOnBehalfDriver.companyId, tripDocumentEvents.companyId),
        eq(timelineOnBehalfDriver.id, tripDocumentEvents.onBehalfOfDriverId),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      ...timelineOrderExpression(
        tripDocumentEvents.occurredAt,
        priorityExpr,
        tripDocumentEvents.id,
      ),
    )
    .limit(params.limit + 1)

  return rows.map((row) => {
    const channel: TripFieldChannel | null =
      row.channel === TRIP_FIELD_CHANNELS.driverApp ? null : row.channel
    return {
      actorName: row.actorName ?? null,
      channel,
      closeReason: null,
      document: { id: row.documentId, number: row.invoiceNumber, series: row.invoiceSeries },
      fromStatus: row.fromStatus,
      id: row.id,
      kind: 'document.status_changed' as const,
      occurrence: null,
      occurredAt: row.occurredAt,
      occurredAtKey: row.occurredAtKey,
      onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
      recordedAt: resolveRecordedAt(channel, row.occurredAt, row.recordedAt),
      returnReason: null,
      stop: null,
      toStatus: row.toStatus,
    }
  })
}
