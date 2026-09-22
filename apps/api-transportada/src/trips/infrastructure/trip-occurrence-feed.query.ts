/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A união das ocorrências da empresa, escopada pelo tenant **em cada junção** — não só na tabela
 * de cima. Uma junção sem `company_id` em qualquer degrau é o caminho pelo qual a ocorrência de
 * uma empresa aparece na tela de outra.
 *
 * São **duas consultas**, uma por tabela, cada uma limitada a `limit + 1` e cortada pelo mesmo
 * cursor (createdAt, id); a página é decidida em memória por `mergeOccurrenceFeed`, que repete o
 * desempate do `order by`. Um `union all` em SQL pouparia a fusão, mas obrigaria as duas metades a
 * caberem na mesma projeção — e elas não cabem: uma tem tipo cadastrado, a outra tem anexo.
 */
import { alias } from 'drizzle-orm/pg-core'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { SQL, SQLWrapper } from 'drizzle-orm'

import { fleetDrivers, fleetVehicles } from '../../database/fleet.schema.js'
import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import { timestamptzParameter } from '../../database/sql-timestamptz-parameter.support.js'
import { storedObjects } from '../../database/storage.schema.js'
import {
  companyOccurrenceTypes,
  TRIP_STOP_OCCURRENCE_KINDS,
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrences,
  tripDocuments,
  tripDrivers,
  tripStopOccurrences,
  tripStops,
  trips,
} from '../../database/trip.schema.js'
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import type { KeysetCursor } from '../../shared/keyset-cursor.support.js'
import { mergeOccurrenceFeed } from '../domain/occurrence-feed.policy.js'
import type { OccurrenceFeedOrder } from '../domain/occurrence-feed.policy.js'
import type {
  TripOccurrenceFeedFilters,
  TripOccurrenceFeedItem,
  TripOccurrenceFeedPage,
  TripOccurrenceFeedQuery,
} from '../application/trip-occurrence-feed.use-case.js'
import type { OccurrenceAttachmentRecord } from '../application/occurrence-attachment.service.js'
import type { TripQueryable } from './trip-queryable.type.js'

type FeedRow = Omit<TripOccurrenceFeedItem, 'createdAt'> & { readonly createdAt: Date }

/** Spec 156 T9 (D3): quem gravou, resolvido pela mesma janela do padrão de nfe-documents (D16, H13). */
const feedActorMembership = alias(userCompanyMemberships, 'trip_occurrence_feed_actor_membership')
const feedActorProfile = alias(identityUserProfiles, 'trip_occurrence_feed_actor_profile')
const feedOnBehalfDriver = alias(fleetDrivers, 'trip_occurrence_feed_on_behalf_driver')

function keysetCondition(
  createdAtColumn: SQLWrapper,
  idColumn: SQLWrapper,
  cursor: KeysetCursor,
  order: OccurrenceFeedOrder,
): SQL {
  const bound = sql`(${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`
  return order === 'desc'
    ? sql`(${createdAtColumn}, ${idColumn}) < ${bound}`
    : sql`(${createdAtColumn}, ${idColumn}) > ${bound}`
}

function orderExpression(
  createdAtColumn: SQLWrapper,
  idColumn: SQLWrapper,
  order: OccurrenceFeedOrder,
): readonly SQL[] {
  return order === 'desc'
    ? [sql`${createdAtColumn} desc`, sql`${idColumn} desc`]
    : [sql`${createdAtColumn} asc`, sql`${idColumn} asc`]
}

function periodConditions(
  createdAtColumn: SQLWrapper,
  filters: TripOccurrenceFeedFilters | undefined,
): readonly SQL[] {
  const conditions: SQL[] = []
  if (filters?.createdFrom !== undefined) {
    conditions.push(
      sql`${createdAtColumn} >= ${timestamptzParameter(new Date(filters.createdFrom))}`,
    )
  }
  if (filters?.createdUntil !== undefined) {
    conditions.push(
      sql`${createdAtColumn} <= ${timestamptzParameter(new Date(filters.createdUntil))}`,
    )
  }
  return conditions
}

/** `stageIn` ausente cobre tudo; presente, cada consulta só corre se o grupo dela foi pedido. */
function stageSelects(filters: TripOccurrenceFeedFilters | undefined): {
  readonly documentStages: null | readonly ('delivery' | 'separation')[]
  readonly includeDocuments: boolean
  readonly includeStops: boolean
} {
  if (filters?.stageIn === undefined || filters.stageIn.length === 0) {
    return { documentStages: null, includeDocuments: true, includeStops: true }
  }
  const documentStages = filters.stageIn.filter(
    (stage): stage is 'delivery' | 'separation' => stage !== 'stop',
  )
  return {
    documentStages: documentStages.length === 0 ? null : documentStages,
    includeDocuments: documentStages.length > 0,
    includeStops: filters.stageIn.includes('stop'),
  }
}

async function listDocumentOccurrenceRows(
  queryable: TripQueryable,
  query: TripOccurrenceFeedQuery,
  cursor: KeysetCursor | null,
  documentStages: null | readonly ('delivery' | 'separation')[],
): Promise<readonly FeedRow[]> {
  const conditions: SQL[] = [
    eq(tripDocumentOccurrences.companyId, query.companyId),
    ...periodConditions(tripDocumentOccurrences.createdAt, query.filters),
  ]
  if (cursor !== null) {
    conditions.push(
      keysetCondition(
        tripDocumentOccurrences.createdAt,
        tripDocumentOccurrences.id,
        cursor,
        query.order,
      ),
    )
  }
  if (documentStages !== null)
    conditions.push(inArray(tripDocumentOccurrences.stage, documentStages))
  if (query.filters?.typeIn !== undefined && query.filters.typeIn.length > 0) {
    conditions.push(inArray(companyOccurrenceTypes.name, query.filters.typeIn))
  }
  if (query.filters?.plateIn !== undefined && query.filters.plateIn.length > 0) {
    conditions.push(inArray(fleetVehicles.plate, query.filters.plateIn))
  }

  const rows = await queryable
    .select({
      actorName: feedActorProfile.name,
      channel: tripDocumentOccurrences.channel,
      createdAt: tripDocumentOccurrences.createdAt,
      description: tripDocumentOccurrences.note,
      driverName: tripDrivers.driverName,
      /**
       * Spec 161 T10 (RF10): sai o `false` fixo — a nota de galpão grava na tabela nova (D2), a de
       * rua na coluna antiga (D6); `hasAttachment` real é a união das duas, sem trazer o anexo
       * inteiro para a listagem (RNF2, nunca URL assinada no cursor).
       */
      hasAttachment: sql<boolean>`(
        exists (
          select 1 from trip_document_occurrence_attachments
          where company_id = ${tripDocumentOccurrences.companyId}
            and occurrence_id = ${tripDocumentOccurrences.id}
        )
        or ${tripDocumentOccurrences.attachmentObjectId} is not null
      )`,
      id: tripDocumentOccurrences.id,
      invoiceNumber: nfeDocuments.number,
      invoiceSeries: nfeDocuments.series,
      notifies: companyOccurrenceTypes.notifies,
      onBehalfOfDriverName: feedOnBehalfDriver.name,
      stage: tripDocumentOccurrences.stage,
      stopLabel: tripStops.label,
      tripId: tripDocuments.tripId,
      typeName: companyOccurrenceTypes.name,
      vehiclePlate: fleetVehicles.plate,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
      ),
    )
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
      ),
    )
    .innerJoin(
      trips,
      and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
    )
    .innerJoin(
      fleetVehicles,
      and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
    )
    .leftJoin(
      tripDrivers,
      and(
        eq(tripDrivers.companyId, trips.companyId),
        eq(tripDrivers.tripId, trips.id),
        eq(tripDrivers.position, sql`1`),
      ),
    )
    .leftJoin(
      tripStops,
      and(eq(tripStops.companyId, tripDocuments.companyId), eq(tripStops.id, tripDocuments.stopId)),
    )
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .leftJoin(
      feedActorMembership,
      and(
        eq(feedActorMembership.companyId, tripDocumentOccurrences.companyId),
        eq(feedActorMembership.userId, tripDocumentOccurrences.actorUserId),
        eq(feedActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(feedActorProfile, eq(feedActorProfile.userId, feedActorMembership.userId))
    .leftJoin(
      feedOnBehalfDriver,
      and(
        eq(feedOnBehalfDriver.companyId, tripDocumentOccurrences.companyId),
        eq(feedOnBehalfDriver.id, tripDocumentOccurrences.onBehalfOfDriverId),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      ...orderExpression(
        tripDocumentOccurrences.createdAt,
        tripDocumentOccurrences.id,
        query.order,
      ),
    )
    .limit(query.limit + 1)

  return rows.map((row) => ({
    actorName: row.actorName ?? null,
    channel: row.channel,
    createdAt: row.createdAt,
    description: row.description,
    driverName: row.driverName ?? '',
    hasAttachment: Boolean(row.hasAttachment),
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceSeries: row.invoiceSeries,
    notifies: row.notifies,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    source: 'document' as const,
    stage: row.stage,
    stopLabel: row.stopLabel,
    tripId: row.tripId,
    typeName: row.typeName,
    vehiclePlate: row.vehiclePlate,
  }))
}

async function listStopOccurrenceRows(
  queryable: TripQueryable,
  query: TripOccurrenceFeedQuery,
  cursor: KeysetCursor | null,
): Promise<readonly FeedRow[]> {
  const conditions: SQL[] = [
    eq(tripStopOccurrences.companyId, query.companyId),
    ...periodConditions(tripStopOccurrences.createdAt, query.filters),
  ]
  if (cursor !== null) {
    conditions.push(
      keysetCondition(tripStopOccurrences.createdAt, tripStopOccurrences.id, cursor, query.order),
    )
  }
  if (query.filters?.typeIn !== undefined && query.filters.typeIn.length > 0) {
    // O filtro de tipo casa com o `kind` do catálogo; nome de tipo cadastrado não é kind de parada.
    const kinds = query.filters.typeIn.filter((value): value is TripStopOccurrenceKind =>
      (TRIP_STOP_OCCURRENCE_KINDS as readonly string[]).includes(value),
    )
    if (kinds.length === 0) return []
    conditions.push(inArray(tripStopOccurrences.kind, kinds))
  }
  if (query.filters?.plateIn !== undefined && query.filters.plateIn.length > 0) {
    conditions.push(inArray(fleetVehicles.plate, query.filters.plateIn))
  }

  const rows = await queryable
    .select({
      actorName: feedActorProfile.name,
      attachmentObjectId: tripStopOccurrences.attachmentObjectId,
      channel: tripStopOccurrences.channel,
      createdAt: tripStopOccurrences.createdAt,
      description: tripStopOccurrences.description,
      driverName: tripDrivers.driverName,
      id: tripStopOccurrences.id,
      invoiceNumber: nfeDocuments.number,
      invoiceSeries: nfeDocuments.series,
      kind: tripStopOccurrences.kind,
      onBehalfOfDriverName: feedOnBehalfDriver.name,
      stopLabel: tripStops.label,
      tripId: tripStops.tripId,
      vehiclePlate: fleetVehicles.plate,
    })
    .from(tripStopOccurrences)
    .innerJoin(
      tripStops,
      and(
        eq(tripStops.companyId, tripStopOccurrences.companyId),
        eq(tripStops.id, tripStopOccurrences.stopId),
      ),
    )
    .innerJoin(trips, and(eq(trips.companyId, tripStops.companyId), eq(trips.id, tripStops.tripId)))
    .innerJoin(
      fleetVehicles,
      and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
    )
    .leftJoin(
      tripDrivers,
      and(
        eq(tripDrivers.companyId, trips.companyId),
        eq(tripDrivers.tripId, trips.id),
        eq(tripDrivers.position, sql`1`),
      ),
    )
    .leftJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripStopOccurrences.companyId),
        eq(tripDocuments.id, tripStopOccurrences.tripDocumentId),
      ),
    )
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripStopOccurrences.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .leftJoin(
      feedActorMembership,
      and(
        eq(feedActorMembership.companyId, tripStopOccurrences.companyId),
        eq(feedActorMembership.userId, tripStopOccurrences.actorUserId),
        eq(feedActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(feedActorProfile, eq(feedActorProfile.userId, feedActorMembership.userId))
    .leftJoin(
      feedOnBehalfDriver,
      and(
        eq(feedOnBehalfDriver.companyId, tripStopOccurrences.companyId),
        eq(feedOnBehalfDriver.id, tripStopOccurrences.onBehalfOfDriverId),
      ),
    )
    .where(and(...conditions))
    .orderBy(...orderExpression(tripStopOccurrences.createdAt, tripStopOccurrences.id, query.order))
    .limit(query.limit + 1)

  return rows.map((row) => ({
    actorName: row.actorName ?? null,
    channel: row.channel,
    createdAt: row.createdAt,
    description: row.description,
    driverName: row.driverName ?? '',
    hasAttachment: row.attachmentObjectId !== null,
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceSeries: row.invoiceSeries,
    notifies: false,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    source: 'stop' as const,
    stage: null,
    stopLabel: row.stopLabel,
    tripId: row.tripId,
    typeName: row.kind,
    vehiclePlate: row.vehiclePlate,
  }))
}

export async function listTripOccurrenceFeed(
  queryable: TripQueryable,
  query: TripOccurrenceFeedQuery,
): Promise<TripOccurrenceFeedPage> {
  const cursor = decodeKeysetCursor(query.cursor)
  const { documentStages, includeDocuments, includeStops } = stageSelects(query.filters)

  const [documentRows, stopRows] = await Promise.all([
    includeDocuments
      ? listDocumentOccurrenceRows(queryable, query, cursor, documentStages)
      : Promise.resolve([] as readonly FeedRow[]),
    includeStops
      ? listStopOccurrenceRows(queryable, query, cursor)
      : Promise.resolve([] as readonly FeedRow[]),
  ])

  const merged = mergeOccurrenceFeed({
    limit: query.limit,
    order: query.order,
    sources: [documentRows, stopRows],
  })
  const last = merged.items[merged.items.length - 1]

  return {
    items: merged.items.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    nextCursor:
      merged.hasMore && last !== undefined
        ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  }
}

const feedAttachmentOriginals = alias(storedObjects, 'trip_occurrence_feed_attachment_original')
const feedAttachmentThumbnails = alias(storedObjects, 'trip_occurrence_feed_attachment_thumbnail')

/**
 * Os anexos de uma ocorrência de parada, para a rota de presign. Id que não é desta empresa, ou que
 * não tem anexo, devolve lista vazia — nunca 404, para não confirmar existência. Fora do escopo da
 * spec 161 (D2/D12): sempre `position: 1`, sem miniatura — a coluna de anexo da parada é sempre a
 * única fonte, e permanece intocada por esta feature.
 */
async function listStopOccurrenceAttachmentLocations(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<readonly OccurrenceAttachmentRecord[]> {
  const rows = await queryable
    .select({
      bucket: storedObjects.bucket,
      id: tripStopOccurrences.id,
      mimeType: storedObjects.mimeType,
      objectKey: storedObjects.objectKey,
      retentionUntil: storedObjects.retentionUntil,
    })
    .from(tripStopOccurrences)
    .innerJoin(
      storedObjects,
      and(
        eq(storedObjects.companyId, tripStopOccurrences.companyId),
        eq(storedObjects.id, tripStopOccurrences.attachmentObjectId),
      ),
    )
    .where(
      and(
        eq(tripStopOccurrences.companyId, input.companyId),
        eq(tripStopOccurrences.id, input.occurrenceId),
      ),
    )

  return rows.map((row) => ({
    id: row.id,
    original: {
      bucket: row.bucket,
      mimeType: row.mimeType,
      objectKey: row.objectKey,
      retentionUntil: row.retentionUntil?.toISOString() ?? null,
    },
    position: 1,
    thumbnail: null,
  }))
}

/**
 * Spec 161 T10 (RF10/RF15): a ocorrência de nota lê pelo mesmo ponto único de `occurrence-attachment.
 * service.ts` (T3) — tabela nova (D2/D12, com miniatura) quando existem linhas, senão a coluna
 * antiga (D6, ocorrência de rua, sempre `position: 1` sem miniatura).
 */
async function listDocumentOccurrenceAttachmentLocations(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<readonly OccurrenceAttachmentRecord[]> {
  const newRows = await queryable
    .select({
      id: tripDocumentOccurrenceAttachments.id,
      originalBucket: feedAttachmentOriginals.bucket,
      originalMimeType: feedAttachmentOriginals.mimeType,
      originalObjectKey: feedAttachmentOriginals.objectKey,
      originalRetentionUntil: feedAttachmentOriginals.retentionUntil,
      position: tripDocumentOccurrenceAttachments.position,
      thumbnailBucket: feedAttachmentThumbnails.bucket,
      thumbnailMimeType: feedAttachmentThumbnails.mimeType,
      thumbnailObjectKey: feedAttachmentThumbnails.objectKey,
      thumbnailRetentionUntil: feedAttachmentThumbnails.retentionUntil,
    })
    .from(tripDocumentOccurrenceAttachments)
    .innerJoin(
      feedAttachmentOriginals,
      and(
        eq(feedAttachmentOriginals.companyId, tripDocumentOccurrenceAttachments.companyId),
        eq(feedAttachmentOriginals.id, tripDocumentOccurrenceAttachments.storedObjectId),
      ),
    )
    .leftJoin(
      feedAttachmentThumbnails,
      and(
        eq(feedAttachmentThumbnails.companyId, tripDocumentOccurrenceAttachments.companyId),
        eq(feedAttachmentThumbnails.id, tripDocumentOccurrenceAttachments.thumbnailObjectId),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrenceAttachments.companyId, input.companyId),
        eq(tripDocumentOccurrenceAttachments.occurrenceId, input.occurrenceId),
      ),
    )
    .orderBy(asc(tripDocumentOccurrenceAttachments.position))

  if (newRows.length > 0) {
    return newRows.map((row) => ({
      id: row.id,
      original: {
        bucket: row.originalBucket,
        mimeType: row.originalMimeType,
        objectKey: row.originalObjectKey,
        retentionUntil: row.originalRetentionUntil?.toISOString() ?? null,
      },
      position: row.position,
      thumbnail:
        row.thumbnailBucket === null || row.thumbnailObjectKey === null
          ? null
          : {
              bucket: row.thumbnailBucket,
              mimeType: row.thumbnailMimeType ?? '',
              objectKey: row.thumbnailObjectKey,
              retentionUntil: row.thumbnailRetentionUntil?.toISOString() ?? null,
            },
    }))
  }

  const legacyRows = await queryable
    .select({
      bucket: storedObjects.bucket,
      id: tripDocumentOccurrences.id,
      mimeType: storedObjects.mimeType,
      objectKey: storedObjects.objectKey,
      retentionUntil: storedObjects.retentionUntil,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      storedObjects,
      and(
        eq(storedObjects.companyId, tripDocumentOccurrences.companyId),
        eq(storedObjects.id, tripDocumentOccurrences.attachmentObjectId),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
      ),
    )

  return legacyRows.map((row) => ({
    id: row.id,
    original: {
      bucket: row.bucket,
      mimeType: row.mimeType,
      objectKey: row.objectKey,
      retentionUntil: row.retentionUntil?.toISOString() ?? null,
    },
    position: 1,
    thumbnail: null,
  }))
}

/**
 * A união das duas fontes de anexo (parada e nota, T7b) — um `occurrenceId` só existe numa delas,
 * então nunca há duplicidade a desempatar.
 */
export async function listTripOccurrenceAttachmentLocations(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<readonly OccurrenceAttachmentRecord[]> {
  const [stopRows, documentRows] = await Promise.all([
    listStopOccurrenceAttachmentLocations(queryable, input),
    listDocumentOccurrenceAttachmentLocations(queryable, input),
  ])
  return [...stopRows, ...documentRows]
}
