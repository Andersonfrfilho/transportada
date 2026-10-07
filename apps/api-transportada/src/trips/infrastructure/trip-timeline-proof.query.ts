/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 228 D1-D3, D7: a foto do canhoto como evento da linha do tempo, derivada de
 * `trip_delivery_proofs` (`kind = 'photo'`) — sem tabela nem coluna nova. A foto é da nota: entra pelo
 * evento de baixa (`stop_event_id`). Só a posição, o canal e o autor saem; nenhum texto de pessoa nem
 * referência de objeto. Erro de fonte propaga: o `nextCursor` sai do último item da página mesclada.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
  tripStops,
} from '../../database/trip.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { resolveRecordedAt } from '../application/trip-timeline-merge.service.js'
import type { TripTimelineRow } from '../application/trip-timeline-merge.service.js'
import type { ReadTripTimelineParams } from '../application/trip-timeline.types.js'
import type { TripQueryable } from './trip-queryable.type.js'
import {
  constantPriority,
  formatTimelineTimestampKey,
  timelineActorMembership,
  timelineActorIsSystem,
  timelineActorProfile,
  timelineKeysetCondition,
  timelineOnBehalfDriver,
  timelineOrderExpression,
} from './trip-timeline-condition.helper.js'
import { documentStopScope, toTimelineLocation } from './trip-timeline-stop.query.js'

/** Uma só expressão para o filtro, a ordem e a chave em texto: se divergirem, a página seguinte pula ou repete. */
const PHOTO_INSTANT = sql`coalesce(${tripDeliveryProofs.capturedAt}, ${tripDeliveryProofs.createdAt})`

export type CanhotoPhotoQueryRow = {
  readonly accuracyMeters: string | null
  readonly actorName: string | null
  readonly capturedAt: Date | null
  readonly channel: TripTimelineRow['channel']
  readonly createdAt: Date
  readonly documentId: string | null
  readonly id: string
  readonly invoiceNumber: string | null
  readonly invoiceSeries: string | null
  readonly isSystemActor: boolean
  readonly lateRegistration: boolean
  readonly latitude: string | null
  readonly locationState: TripTimelineRow['locationState']
  readonly longitude: string | null
  readonly occurredAtKey: string
  readonly onBehalfOfDriverName: string | null
  readonly referenceLatitude: string | null
  readonly referenceLongitude: string | null
  readonly stopId: string
  readonly stopSequence: bigint | number
}

export function toCanhotoPhotoTimelineRow(row: CanhotoPhotoQueryRow): TripTimelineRow {
  const occurredAt = row.capturedAt ?? row.createdAt
  return {
    actorName: row.actorName ?? null,
    isSystemActor: row.isSystemActor,
    channel: row.channel,
    closeReason: null,
    document:
      row.documentId === null
        ? null
        : { id: row.documentId, number: row.invoiceNumber, series: row.invoiceSeries },
    fromStatus: null,
    id: row.id,
    kind: 'document.canhoto_photo',
    lateRegistration: row.lateRegistration,
    location: toTimelineLocation({ ...row, recordedAt: row.createdAt }),
    locationState: row.locationState ?? null,
    occurrence: null,
    occurredAt,
    occurredAtKey: row.occurredAtKey,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    recordedAt: resolveRecordedAt(row.channel, occurredAt, row.createdAt),
    returnReason: null,
    stop: { id: row.stopId, sequence: Number(row.stopSequence) },
    toStatus: null,
  }
}

function buildPhotoConditions(params: ReadTripTimelineParams): SQL[] {
  const conditions: SQL[] = [
    eq(tripDeliveryProofs.companyId, params.companyId),
    eq(tripStops.companyId, params.companyId),
    eq(tripStops.tripId, params.tripId),
    sql`${tripDeliveryProofs.kind} = 'photo'`,
  ]
  if (params.documentId !== undefined) {
    conditions.push(eq(tripStopEvents.tripDocumentId, params.documentId), documentStopScope(params))
  }
  if (params.cursor !== null) {
    conditions.push(
      timelineKeysetCondition(
        PHOTO_INSTANT,
        constantPriority('document.canhoto_photo'),
        tripDeliveryProofs.id,
        params.cursor,
      ),
    )
  }
  return conditions
}

export async function listCanhotoPhotoRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const rows = await queryable
    .select({
      accuracyMeters: tripDeliveryProofs.accuracyMeters,
      actorName: timelineActorProfile.name,
      isSystemActor: timelineActorIsSystem,
      capturedAt: tripDeliveryProofs.capturedAt,
      channel: tripDeliveryProofs.channel,
      createdAt: tripDeliveryProofs.createdAt,
      documentId: tripDocuments.id,
      id: tripDeliveryProofs.id,
      invoiceNumber: nfeDocuments.number,
      invoiceSeries: nfeDocuments.series,
      lateRegistration: tripDeliveryProofs.lateRegistration,
      latitude: tripDeliveryProofs.latitude,
      locationState: tripDeliveryProofs.locationState,
      longitude: tripDeliveryProofs.longitude,
      occurredAtKey: formatTimelineTimestampKey(PHOTO_INSTANT),
      onBehalfOfDriverName: timelineOnBehalfDriver.name,
      referenceLatitude: geocodedAddresses.latitude,
      referenceLongitude: geocodedAddresses.longitude,
      stopId: tripStops.id,
      stopSequence: tripStops.sequence,
    })
    .from(tripDeliveryProofs)
    .innerJoin(
      tripStopEvents,
      and(
        eq(tripStopEvents.companyId, tripDeliveryProofs.companyId),
        eq(tripStopEvents.id, tripDeliveryProofs.stopEventId),
      ),
    )
    .innerJoin(
      tripStops,
      and(
        eq(tripStops.companyId, tripStopEvents.companyId),
        eq(tripStops.id, tripStopEvents.stopId),
      ),
    )
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
        eq(timelineActorMembership.companyId, tripDeliveryProofs.companyId),
        eq(timelineActorMembership.userId, tripDeliveryProofs.actorUserId),
        eq(timelineActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(timelineActorProfile, eq(timelineActorProfile.userId, timelineActorMembership.userId))
    .leftJoin(
      timelineOnBehalfDriver,
      and(
        eq(timelineOnBehalfDriver.companyId, tripDeliveryProofs.companyId),
        eq(timelineOnBehalfDriver.id, tripDeliveryProofs.onBehalfOfDriverId),
      ),
    )
    .where(and(...buildPhotoConditions(params)))
    .orderBy(
      ...timelineOrderExpression(
        PHOTO_INSTANT,
        constantPriority('document.canhoto_photo'),
        tripDeliveryProofs.id,
      ),
    )
    .limit(params.limit + 1)

  return rows.map(toCanhotoPhotoTimelineRow)
}
