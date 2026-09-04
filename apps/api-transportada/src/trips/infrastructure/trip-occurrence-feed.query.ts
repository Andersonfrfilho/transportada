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
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { SQL, SQLWrapper } from 'drizzle-orm'

import { fleetVehicles } from '../../database/fleet.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import {
  companyOccurrenceTypes,
  TRIP_STOP_OCCURRENCE_KINDS,
  tripDocumentOccurrences,
  tripDocuments,
  tripDrivers,
  tripStopOccurrences,
  tripStops,
  trips,
} from '../../database/trip.schema.js'
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
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
import type { TripQueryable } from './trip-queryable.type.js'

type FeedRow = Omit<TripOccurrenceFeedItem, 'createdAt'> & { readonly createdAt: Date }

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
    conditions.push(sql`${createdAtColumn} >= ${new Date(filters.createdFrom)}`)
  }
  if (filters?.createdUntil !== undefined) {
    conditions.push(sql`${createdAtColumn} <= ${new Date(filters.createdUntil)}`)
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
      createdAt: tripDocumentOccurrences.createdAt,
      description: tripDocumentOccurrences.note,
      driverName: tripDrivers.driverName,
      id: tripDocumentOccurrences.id,
      invoiceNumber: nfeDocuments.number,
      invoiceSeries: nfeDocuments.series,
      notifies: companyOccurrenceTypes.notifies,
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
    createdAt: row.createdAt,
    description: row.description,
    driverName: row.driverName ?? '',
    hasAttachment: false,
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceSeries: row.invoiceSeries,
    notifies: row.notifies,
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
      attachmentObjectId: tripStopOccurrences.attachmentObjectId,
      createdAt: tripStopOccurrences.createdAt,
      description: tripStopOccurrences.description,
      driverName: tripDrivers.driverName,
      id: tripStopOccurrences.id,
      invoiceNumber: nfeDocuments.number,
      invoiceSeries: nfeDocuments.series,
      kind: tripStopOccurrences.kind,
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
    .where(and(...conditions))
    .orderBy(...orderExpression(tripStopOccurrences.createdAt, tripStopOccurrences.id, query.order))
    .limit(query.limit + 1)

  return rows.map((row) => ({
    createdAt: row.createdAt,
    description: row.description,
    driverName: row.driverName ?? '',
    hasAttachment: row.attachmentObjectId !== null,
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceSeries: row.invoiceSeries,
    notifies: false,
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

/**
 * Os anexos de uma ocorrência de parada, para a rota de presign. Ocorrência de nota não tem anexo,
 * e id que não é desta empresa devolve lista vazia — nunca 404, para não confirmar existência.
 */
export async function listTripOccurrenceAttachmentLocations(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<
  readonly {
    readonly bucket: string
    readonly id: string
    readonly mimeType: string
    readonly objectKey: string
  }[]
> {
  return queryable
    .select({
      bucket: storedObjects.bucket,
      id: tripStopOccurrences.id,
      mimeType: storedObjects.mimeType,
      objectKey: storedObjects.objectKey,
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
}
