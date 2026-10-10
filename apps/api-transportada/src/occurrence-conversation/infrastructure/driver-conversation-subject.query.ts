/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4 (api-contract, "Consulta da lista"): a lista do motorista numa consulta só — filtro de
 * visibilidade (ADR-0101 §3), última mensagem e agregados por `LATERAL` — e as buscas em lote do assunto
 * (`driver-subject-facts.query.ts`) por cima. Nenhuma consulta por conversa.
 */
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { EffectiveConversationStatus } from '../domain/conversation-effective-status.policy.js'
import { DRIVER_SUBJECT_PREVIEW_LENGTH } from '../domain/driver-subject-conversation.constant.js'
import type { SubjectConversationRow } from '../application/driver-conversation-subject.port.js'
import type { KeysetCursor } from '../../shared/keyset-cursor.support.js'
import {
  OCCURRENCE_CONVERSATION_SUBJECT,
  type OccurrenceConversationSubjectType,
} from '../../shared/occurrence-conversation-subject.constant.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import { readSubjectFacts } from './driver-subject-facts.query.js'
import type { SubjectFacts } from './driver-subject-facts.query.js'

type RawSubjectRow = {
  readonly channels: string
  readonly conversation_id: string
  readonly last_direction: 'inbound' | 'outbound' | null
  readonly last_message_at: Date | null | string
  readonly last_preview: null | string
  readonly occurrence_id: null | string
  readonly occurrence_kind: null | string
  readonly protocol: string
  readonly sort_at: Date | string
  readonly stored_status: EffectiveConversationStatus
  readonly subject_type: OccurrenceConversationSubjectType
  readonly trip_document_id: null | string
  readonly trip_id: null | string
  readonly unread: number | string
}

export type ListSubjectRowsInput = {
  readonly companyId: string
  readonly conversationId?: string
  readonly cursor: KeysetCursor | null
  readonly driverId: string
  readonly driverUserId: string
  readonly limit: number
}

const SORT_AT = sql`date_trunc('milliseconds', coalesce(latest.created_at, c.created_at))`

/** Quem alcança: o destinatário, ou o principal da viagem agora (só nota e viagem); e a tripulação. */
function visibility(input: ListSubjectRowsInput): SQL {
  return sql`c.company_id = ${input.companyId} and c.participant = 'driver'
    and (c.driver_user_id = ${input.driverUserId}
      or (c.subject_type <> ${OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE} and exists (
        select 1 from trip_drivers principal
        where principal.company_id = c.company_id and principal.trip_id = c.trip_id
          and principal.driver_id = ${input.driverId} and principal.position = 1)))
    and (c.trip_id is null or exists (
      select 1 from trip_drivers crew
      where crew.company_id = c.company_id and crew.trip_id = c.trip_id
        and crew.driver_id = ${input.driverId}))`
}

function keysetFilter(cursor: KeysetCursor | null): SQL {
  if (cursor === null) return sql`true`
  return sql`(${SORT_AT}, c.id) < (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`
}

async function readRawRows(
  queryable: TripQueryable,
  input: ListSubjectRowsInput,
): Promise<readonly RawSubjectRow[]> {
  const onlyConversation =
    input.conversationId === undefined ? sql`true` : sql`c.id = ${input.conversationId}::uuid`
  return queryable.execute<RawSubjectRow>(sql`
    select c.id as conversation_id, c.subject_type, c.occurrence_id, c.occurrence_kind, c.trip_id,
      c.trip_document_id, c.protocol, c.status as stored_status, ${SORT_AT} as sort_at,
      latest.created_at as last_message_at, latest.preview as last_preview,
      latest.direction as last_direction, totals.unread, totals.channels
    from occurrence_conversations c
    left join lateral (
      select m.created_at, left(m.body_text, ${DRIVER_SUBJECT_PREVIEW_LENGTH}) as preview, m.direction
      from occurrence_conversation_messages m
      where m.company_id = c.company_id and m.conversation_id = c.id
      order by m.created_at desc, m.id desc limit 1) latest on true
    left join lateral (
      select (count(*) filter (where m.direction = 'outbound' and m.status is distinct from 'read'))::int as unread,
        coalesce(string_agg(distinct m.channel, ','), '') as channels
      from occurrence_conversation_messages m
      where m.company_id = c.company_id and m.conversation_id = c.id) totals on true
    where ${visibility(input)} and ${onlyConversation} and ${keysetFilter(input.cursor)}
    order by ${SORT_AT} desc, c.id desc
    limit ${input.limit + 1}`)
}

function subjectIdOf(row: RawSubjectRow): null | string {
  if (row.subject_type === OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT) return row.trip_document_id
  if (row.subject_type === OCCURRENCE_CONVERSATION_SUBJECT.TRIP) return row.trip_id
  return row.occurrence_id
}

function idsOf(rows: readonly RawSubjectRow[], pick: (row: RawSubjectRow) => null | string) {
  return rows.flatMap((row) => pick(row) ?? [])
}

function factsFor(
  row: RawSubjectRow,
  subjectId: string,
  maps: Awaited<ReturnType<typeof readSubjectFacts>>,
): SubjectFacts | undefined {
  if (row.subject_type === OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT)
    return maps.documents.get(subjectId)
  if (row.subject_type === OCCURRENCE_CONVERSATION_SUBJECT.TRIP) return maps.trips.get(subjectId)
  return row.occurrence_kind === 'stop'
    ? maps.stopOccurrences.get(subjectId)
    : maps.documentOccurrences.get(subjectId)
}

export async function listSubjectConversationRows(
  queryable: TripQueryable,
  input: ListSubjectRowsInput,
): Promise<{ readonly hasMore: boolean; readonly rows: readonly SubjectConversationRow[] }> {
  const raw = await readRawRows(queryable, input)
  const page = raw.slice(0, input.limit)
  const maps = await readSubjectFacts(queryable, {
    companyId: input.companyId,
    documentLinkIds: idsOf(page, (row) =>
      row.subject_type === OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT ? row.trip_document_id : null,
    ),
    documentOccurrenceIds: idsOf(page, (row) =>
      row.subject_type === OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE &&
      row.occurrence_kind === 'document'
        ? row.occurrence_id
        : null,
    ),
    stopOccurrenceIds: idsOf(page, (row) =>
      row.subject_type === OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE &&
      row.occurrence_kind === 'stop'
        ? row.occurrence_id
        : null,
    ),
    tripIds: idsOf(page, (row) =>
      row.subject_type === OCCURRENCE_CONVERSATION_SUBJECT.TRIP ? row.trip_id : null,
    ),
  })
  const rows = page.flatMap((row): readonly SubjectConversationRow[] => {
    const subjectId = subjectIdOf(row)
    const facts = subjectId === null ? undefined : factsFor(row, subjectId, maps)
    if (subjectId === null || facts === undefined) return []
    return [
      {
        channels: row.channels === '' ? [] : row.channels.split(','),
        conversationId: row.conversation_id,
        documentReleasedAt: facts.documentReleasedAt,
        iconName: facts.iconName,
        labelFacts: facts.labelFacts,
        lastMessageAt: row.last_message_at === null ? null : new Date(row.last_message_at),
        lastMessageDirection: row.last_direction,
        lastMessagePreview: row.last_preview,
        protocol: row.protocol,
        sortAt: new Date(row.sort_at),
        storedStatus: row.stored_status,
        subjectId,
        subjectType: row.subject_type,
        tripId: row.trip_id,
        tripStatus: facts.tripStatus,
        unreadCount: Number(row.unread),
      },
    ]
  })
  return { hasMore: raw.length > input.limit, rows }
}
