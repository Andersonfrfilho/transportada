/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5 (D5, D6, D8; ADR-0068 §4): a linha do tempo une oito fontes de uma viagem só, cada
 * uma escopada por `company_id` **em cada junção** — o mesmo cuidado de
 * `trip-occurrence-feed.query.ts`, cuja tenant-safety este arquivo estende
 * (`test/trip-schema/trip-timeline-query-tenant-safety.contract.ts`). A única exceção continua
 * sendo o perfil de identidade (`identity_user_profiles`), que não tem `company_id` — ele só entra
 * depois de uma junção com `user_company_memberships` já escopada pela empresa.
 *
 * Cada fonte já vem limitada a `limit + 1`, filtrada pelo cursor e ordenada por
 * `(occurredAt desc, prioridade do kind, id desc)` — o mesmo desempate de `mergeTripTimeline`, para
 * o cursor nunca pular nem repetir linha na fronteira da página (D8).
 *
 * `trip_document_events` (D3, ADR-0068 §4): o motorista nunca grava nessa tabela, então
 * `channel = 'driver_app'` ali significa "canal não registrado" — sai como `channel: null`, nunca
 * como o rótulo de app do motorista.
 */
import { alias } from 'drizzle-orm/pg-core'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { SQL, SQLWrapper } from 'drizzle-orm'

import { fleetDrivers } from '../../database/fleet.schema.js'
import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  companyOccurrenceTypes,
  tripDispatchSnapshots,
  tripDocumentEvents,
  tripDocumentOccurrences,
  tripDocuments,
  trips,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
  tripStops,
} from '../../database/trip.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { TRIP_FIELD_CHANNELS } from '../domain/trip-field-channel.constant.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import { TRIP_TIMELINE_KIND_PRIORITY } from '../application/trip-timeline.types.js'
import type {
  ReadTripTimelineParams,
  ReadTripTimelineResult,
  TripTimelineCursor,
  TripTimelineItem,
  TripTimelineKind,
} from '../application/trip-timeline.types.js'
import type { TripQueryable } from './trip-queryable.type.js'

const timelineActorMembership = alias(userCompanyMemberships, 'trip_timeline_actor_membership')
const timelineActorProfile = alias(identityUserProfiles, 'trip_timeline_actor_profile')
const timelineOnBehalfDriver = alias(fleetDrivers, 'trip_timeline_on_behalf_driver')

/** Linha comum às seis fontes, antes de virar `TripTimelineItem` (datas cruas para ordenar/comparar). */
export type TripTimelineRow = Omit<TripTimelineItem, 'occurredAt' | 'recordedAt'> & {
  readonly occurredAt: Date
  readonly recordedAt: Date | null
}

const RECORDED_AT_THRESHOLD_MS = 60_000

/** D6: só quando o escritório informou a hora do fato, e ela diverge da hora do registro por >60s. */
function resolveRecordedAt(
  channel: TripFieldChannel | null,
  occurredAt: Date,
  recordedAt: Date,
): Date | null {
  if (channel !== TRIP_FIELD_CHANNELS.office) return null
  const diffMs = Math.abs(recordedAt.getTime() - occurredAt.getTime())
  return diffMs > RECORDED_AT_THRESHOLD_MS ? recordedAt : null
}

function timelineKeysetCondition(
  occurredAtColumn: SQLWrapper,
  priorityExpression: SQL,
  idColumn: SQLWrapper,
  cursor: TripTimelineCursor,
): SQL {
  return sql`(${occurredAtColumn}, ${priorityExpression}, ${idColumn}) < (${cursor.occurredAt.toISOString()}::timestamptz, ${cursor.kindPriority}::int, ${cursor.id}::uuid)`
}

function timelineOrderExpression(
  occurredAtColumn: SQLWrapper,
  priorityExpression: SQL,
  idColumn: SQLWrapper,
): readonly SQL[] {
  return [sql`${occurredAtColumn} desc`, sql`${priorityExpression} asc`, sql`${idColumn} desc`]
}

function constantPriority(kind: TripTimelineKind): SQL {
  return sql`${TRIP_TIMELINE_KIND_PRIORITY[kind]}::int`
}

async function listDispatchedRows(
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
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      id: tripDispatchSnapshots.id,
      occurredAt: tripDispatchSnapshots.dispatchedAt,
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
    document: null,
    fromStatus: null,
    id: row.id,
    kind: 'trip.dispatched' as const,
    occurrence: null,
    occurredAt: row.occurredAt,
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: null,
    toStatus: null,
  }))
}

async function listStatusChangedRows(
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
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      channel: tripStatusEvents.channel,
      fromStatus: tripStatusEvents.fromStatus,
      id: tripStatusEvents.id,
      occurredAt: tripStatusEvents.occurredAt,
      onBehalfOfDriverName: timelineOnBehalfDriver.name,
      recordedAt: tripStatusEvents.recordedAt,
      toStatus: tripStatusEvents.toStatus,
    })
    .from(tripStatusEvents)
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
    document: null,
    fromStatus: row.fromStatus,
    id: row.id,
    kind: 'trip.status_changed' as const,
    occurrence: null,
    occurredAt: row.occurredAt,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    recordedAt: resolveRecordedAt(row.channel, row.occurredAt, row.recordedAt),
    returnReason: null,
    stop: null,
    toStatus: row.toStatus,
  }))
}

const STOP_EVENT_KIND_TO_TIMELINE_KIND = {
  arrived: 'stop.arrived',
  delivered: 'document.delivered',
  returned: 'document.returned',
} as const satisfies Record<string, TripTimelineKind>

async function listStopEventRows(
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
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    recordedAt: resolveRecordedAt(row.channel, row.occurredAt, row.recordedAt),
    returnReason: row.kind === 'returned' ? (row.returnReason ?? null) : null,
    stop: { id: row.stopId, sequence: Number(row.stopSequence) },
    toStatus: null,
  }))
}

async function listStopOccurrenceRows(
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
    document: null,
    fromStatus: null,
    id: row.id,
    kind: 'stop.occurrence' as const,
    occurrence: { note: row.description, typeName: row.kind },
    occurredAt: row.occurredAt,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    recordedAt: null,
    returnReason: null,
    stop: { id: row.stopId, sequence: Number(row.stopSequence) },
    toStatus: null,
  }))
}

async function listDocumentOccurrenceRows(
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
    )
  }

  const rows = await queryable
    .select({
      actorName: timelineActorProfile.name,
      channel: tripDocumentOccurrences.channel,
      documentId: tripDocuments.id,
      id: tripDocumentOccurrences.id,
      invoiceNumber: nfeDocuments.number,
      invoiceSeries: nfeDocuments.series,
      note: tripDocumentOccurrences.note,
      occurredAt: tripDocumentOccurrences.createdAt,
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
    document: { id: row.documentId, number: row.invoiceNumber, series: row.invoiceSeries },
    fromStatus: null,
    id: row.id,
    kind: 'document.occurrence' as const,
    occurrence: { note: row.note, typeName: row.typeName },
    occurredAt: row.occurredAt,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    recordedAt: null,
    returnReason: null,
    stop: null,
    toStatus: null,
  }))
}

async function listDocumentStatusChangedRows(
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
      document: { id: row.documentId, number: row.invoiceNumber, series: row.invoiceSeries },
      fromStatus: row.fromStatus,
      id: row.id,
      kind: 'document.status_changed' as const,
      occurrence: null,
      occurredAt: row.occurredAt,
      onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
      recordedAt: resolveRecordedAt(channel, row.occurredAt, row.recordedAt),
      returnReason: null,
      stop: null,
      toStatus: row.toStatus,
    }
  })
}

function compareTimelineRows(first: TripTimelineRow, second: TripTimelineRow): number {
  const byTime = second.occurredAt.getTime() - first.occurredAt.getTime()
  if (byTime !== 0) return byTime
  const byPriority =
    TRIP_TIMELINE_KIND_PRIORITY[second.kind] - TRIP_TIMELINE_KIND_PRIORITY[first.kind]
  if (byPriority !== 0) return byPriority
  // Desempate final por id, decrescente — o mesmo sentido do `order by ... id desc` de cada fonte.
  return first.id < second.id ? 1 : first.id > second.id ? -1 : 0
}

export type MergeTripTimelineResult = {
  readonly hasMore: boolean
  readonly items: readonly TripTimelineRow[]
}

/**
 * Cada fonte já vem limitada a `limit + 1` e cortada pelo mesmo cursor; aqui só se ordena, corta em
 * `limit` e decide se sobrou linha (`hasMore`). Pura, sem I/O — testável sem banco (D8: ordem e
 * desempate; T5 do cursor: 250 itens em páginas de 100 sem repetir nem pular).
 */
export function mergeTripTimeline(input: {
  readonly limit: number
  readonly sources: readonly (readonly TripTimelineRow[])[]
}): MergeTripTimelineResult {
  const merged = input.sources.flatMap((source) => [...source]).sort(compareTimelineRows)
  return { hasMore: merged.length > input.limit, items: merged.slice(0, input.limit) }
}

/**
 * Decodifica o cursor opaco desta leitura (base64url de JSON). **Não é validação de borda** — só
 * aceita o formato que `encodeTripTimelineCursor` produziu; `null` para qualquer coisa mal formada,
 * nunca lança. A validação Zod do parâmetro de querystring (formato, presença) é da rota (T6); este
 * parse é reaproveitado por ela para virar o `TripTimelineCursor` tipado que `listTripTimeline` usa.
 */
export function parseTripTimelineCursor(value: string | null): TripTimelineCursor | null {
  if (value === null) return null
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded) as {
      readonly id?: unknown
      readonly kindPriority?: unknown
      readonly occurredAt?: unknown
    }
    if (typeof parsed.id !== 'string' || parsed.id.length === 0) return null
    if (typeof parsed.kindPriority !== 'number' || !Number.isInteger(parsed.kindPriority))
      return null
    if (typeof parsed.occurredAt !== 'string') return null
    const occurredAt = new Date(parsed.occurredAt)
    if (Number.isNaN(occurredAt.getTime())) return null
    return { id: parsed.id, kindPriority: parsed.kindPriority, occurredAt }
  } catch {
    return null
  }
}

export function encodeTripTimelineCursor(cursor: TripTimelineCursor): string {
  const payload = JSON.stringify({
    id: cursor.id,
    kindPriority: cursor.kindPriority,
    occurredAt: cursor.occurredAt.toISOString(),
  })
  return Buffer.from(payload, 'utf8').toString('base64url')
}

/**
 * Spec 158 T6: existência da viagem **nesta empresa**, antes de ler qualquer fonte da linha do
 * tempo — molde de `DrizzleTripCostRepository.listByTrip` (`select({ id: trips.id })`). As seis
 * fontes de `listTripTimeline` não servem para isso: viagem sem nenhum evento ainda devolveria
 * itens vazios tanto para "existe e está silenciosa" quanto para "não existe", e o 404 se perderia.
 */
export async function findTripCompanyScope(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<{ readonly id: string } | null> {
  const [trip] = await queryable
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  return trip ?? null
}

/**
 * A linha do tempo de uma viagem: seis consultas (D5 — `trip_stop_events` cobre três `kind`s),
 * escopadas por `companyId` e `tripId`, unidas em memória por `mergeTripTimeline`. RNF: uma consulta
 * por fonte, `Promise.all`, sem N+1.
 */
export async function listTripTimeline(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<ReadTripTimelineResult> {
  const [
    dispatched,
    statusChanged,
    stopEvents,
    stopOccurrences,
    documentOccurrences,
    documentStatusChanged,
  ] = await Promise.all([
    listDispatchedRows(queryable, params),
    listStatusChangedRows(queryable, params),
    listStopEventRows(queryable, params),
    listStopOccurrenceRows(queryable, params),
    listDocumentOccurrenceRows(queryable, params),
    listDocumentStatusChangedRows(queryable, params),
  ])

  const merged = mergeTripTimeline({
    limit: params.limit,
    sources: [
      dispatched,
      statusChanged,
      stopEvents,
      stopOccurrences,
      documentOccurrences,
      documentStatusChanged,
    ],
  })
  const last = merged.items[merged.items.length - 1]

  return {
    items: merged.items.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
      recordedAt: row.recordedAt === null ? null : row.recordedAt.toISOString(),
    })),
    nextCursor:
      merged.hasMore && last !== undefined
        ? encodeTripTimelineCursor({
            id: last.id,
            kindPriority: TRIP_TIMELINE_KIND_PRIORITY[last.kind],
            occurredAt: last.occurredAt,
          })
        : null,
  }
}
