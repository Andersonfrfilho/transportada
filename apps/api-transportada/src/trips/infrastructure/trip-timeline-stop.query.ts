/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5/T9: duas das seis fontes da linha do tempo — `trip_stop_events` (D5: cobre os três
 * `kind`s `arrived`/`delivered`/`returned`) e `trip_stop_occurrences`. Escopadas por `company_id` em
 * cada junção.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { distanceInMetres } from '../../addresses/domain/coordinate-distance.js'
import { geocodedAddresses } from '../../database/geocoding.schema.js'
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
  TripTimelineLocation,
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
  /** Spec 206 D1/D18/D12: a saída para a parada, e o cancelamento dela. */
  departed: 'stop.departed',
  departure_cancelled: 'stop.departure_cancelled',
  returned: 'document.returned',
} as const satisfies Record<string, TripTimelineKind>

type StopEventLocationColumns = {
  readonly accuracyMeters: string | null
  readonly capturedAt: Date | null
  readonly latitude: string | null
  readonly longitude: string | null
  readonly recordedAt: Date
  readonly referenceLatitude: string | null
  readonly referenceLongitude: string | null
}

/** `captured_at` é anulável no histórico preenchido pela migration; `recorded_at` é a data do próprio carimbo. */
export function toTimelineLocation(row: StopEventLocationColumns): TripTimelineLocation | null {
  if (row.latitude === null || row.longitude === null) return null
  const distance =
    row.referenceLatitude === null || row.referenceLongitude === null
      ? null
      : distanceInMetres(
          { latitude: row.latitude, longitude: row.longitude },
          { latitude: row.referenceLatitude, longitude: row.referenceLongitude },
        )
  return {
    accuracyMeters: row.accuracyMeters === null ? null : Number(row.accuracyMeters),
    capturedAt: (row.capturedAt ?? row.recordedAt).toISOString(),
    distanceMeters: distance === null ? null : Math.round(distance),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  }
}

/** Spec 233 (revisão A1): evento e ocorrência de parada, com o filtro por nota, são só os da parada dela. */
export function documentStopScope(params: ReadTripTimelineParams): SQL {
  if (params.documentStopId === undefined || params.documentStopId === null) return sql`false`
  return eq(tripStops.id, params.documentStopId)
}

export async function listStopEventRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const priorityExpr = sql`case ${tripStopEvents.kind}
    when 'arrived' then ${TRIP_TIMELINE_KIND_PRIORITY['stop.arrived']}
    when 'delivered' then ${TRIP_TIMELINE_KIND_PRIORITY['document.delivered']}
    when 'departed' then ${TRIP_TIMELINE_KIND_PRIORITY['stop.departed']}
    when 'departure_cancelled' then ${TRIP_TIMELINE_KIND_PRIORITY['stop.departure_cancelled']}
    else ${TRIP_TIMELINE_KIND_PRIORITY['document.returned']}
  end::int`
  const conditions: SQL[] = [
    eq(tripStopEvents.companyId, params.companyId),
    eq(tripStops.tripId, params.tripId),
    inArray(tripStopEvents.kind, [
      'arrived',
      'delivered',
      'returned',
      'departed',
      'departure_cancelled',
    ]),
  ]
  if (params.documentId !== undefined) {
    conditions.push(
      documentStopScope(params),
      sql`(${isNull(tripStopEvents.tripDocumentId)} or ${eq(tripStopEvents.tripDocumentId, params.documentId)})`,
    )
  }
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
      accuracyMeters: tripStopEvents.accuracyMeters,
      actorName: timelineActorProfile.name,
      capturedAt: tripStopEvents.capturedAt,
      channel: tripStopEvents.channel,
      documentId: tripDocuments.id,
      id: tripStopEvents.id,
      invoiceNumber: nfeDocuments.number,
      invoiceSeries: nfeDocuments.series,
      kind: tripStopEvents.kind,
      lateRegistration: tripStopEvents.lateRegistration,
      latitude: tripStopEvents.latitude,
      locationState: tripStopEvents.locationState,
      longitude: tripStopEvents.longitude,
      occurredAt: tripStopEvents.createdAt,
      occurredAtKey: formatTimelineTimestampKey(tripStopEvents.createdAt),
      onBehalfOfDriverName: timelineOnBehalfDriver.name,
      recordedAt: tripStopEvents.recordedAt,
      referenceLatitude: geocodedAddresses.latitude,
      referenceLongitude: geocodedAddresses.longitude,
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
    // `geocoded_addresses` é global por `address_key` (ADR-0044 §5) e não tem `company_id`; o escopo
    // da empresa já vem de `trip_stops`, que dá a chave.
    .leftJoin(geocodedAddresses, eq(geocodedAddresses.addressKey, tripStops.addressKey))
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
    lateRegistration: row.lateRegistration,
    location: toTimelineLocation(row),
    locationState: row.locationState ?? null,
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
  if (params.documentId !== undefined) conditions.push(documentStopScope(params))
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
      accuracyMeters: tripStopOccurrences.accuracyMeters,
      actorName: timelineActorProfile.name,
      /** Fora do escopo da spec 161 (D2/D12): a parada só tem a coluna antiga, no máximo um anexo. */
      attachmentObjectId: tripStopOccurrences.attachmentObjectId,
      capturedAt: tripStopOccurrences.capturedAt,
      channel: tripStopOccurrences.channel,
      description: tripStopOccurrences.description,
      id: tripStopOccurrences.id,
      kind: tripStopOccurrences.kind,
      latitude: tripStopOccurrences.latitude,
      locationState: tripStopOccurrences.locationState,
      longitude: tripStopOccurrences.longitude,
      occurredAt: tripStopOccurrences.createdAt,
      occurredAtKey: formatTimelineTimestampKey(tripStopOccurrences.createdAt),
      onBehalfOfDriverName: timelineOnBehalfDriver.name,
      referenceLatitude: geocodedAddresses.latitude,
      referenceLongitude: geocodedAddresses.longitude,
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
    .leftJoin(geocodedAddresses, eq(geocodedAddresses.addressKey, tripStops.addressKey))
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
    lateRegistration: false,
    location: toTimelineLocation({ ...row, recordedAt: row.occurredAt }),
    locationState: row.locationState ?? null,
    occurrence: {
      attachmentCount: row.attachmentObjectId === null ? 0 : 1,
      note: row.description,
      typeName: row.kind,
    },
    occurredAt: row.occurredAt,
    occurredAtKey: row.occurredAtKey,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    recordedAt: null,
    returnReason: null,
    stop: { id: row.stopId, sequence: Number(row.stopSequence) },
    toStatus: null,
  }))
}
