/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b (api-contract, "Consulta da lista"): as conversas de nota e de viagem de uma viagem numa
 * consulta só — última mensagem, canais e não lidas por `LATERAL` — e as buscas em lote do assunto
 * (`driver-subject-facts.query.ts`) por cima. Nenhuma consulta por conversa. Não lidas é do ponto de vista
 * do usuário do escritório: mensagens do motorista depois da última que ele marcou como lida.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { trips } from '../../database/database.schema.js'
import {
  OCCURRENCE_CONVERSATION_SUBJECT,
  type OccurrenceConversationSubjectType,
} from '../../shared/occurrence-conversation-subject.constant.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type { OfficeSubjectRow } from '../application/office-subject-conversation.port.js'
import type { EffectiveConversationStatus } from '../domain/conversation-effective-status.policy.js'
import { DRIVER_SUBJECT_PREVIEW_LENGTH } from '../domain/driver-subject-conversation.constant.js'
import { OFFICE_SUBJECT_LIST_LIMIT } from '../domain/office-subject-conversation.constant.js'
import { readSubjectFacts } from './driver-subject-facts.query.js'

type RawRow = {
  readonly channels: string
  readonly conversation_id: string
  readonly driver_name: null | string
  readonly last_direction: 'inbound' | 'outbound' | null
  readonly last_message_at: Date | null | string
  readonly last_preview: null | string
  readonly protocol: string
  readonly sort_at: Date | string
  readonly stored_status: EffectiveConversationStatus
  readonly subject_type: OccurrenceConversationSubjectType
  readonly trip_document_id: null | string
  readonly trip_id: string
  readonly unread: number | string
}

type ListInput = {
  readonly companyId: string
  readonly conversationId?: string
  readonly tripId: string
  readonly userId: string
}

const SORT_AT = sql`date_trunc('milliseconds', coalesce(latest.created_at, c.created_at))`

function readRawRows(queryable: TripQueryable, input: ListInput): Promise<readonly RawRow[]> {
  const only: SQL =
    input.conversationId === undefined ? sql`true` : sql`c.id = ${input.conversationId}::uuid`
  return queryable.execute<RawRow>(sql`
    select c.id as conversation_id, c.subject_type, c.trip_id, c.trip_document_id, c.protocol,
      c.status as stored_status, ${SORT_AT} as sort_at, latest.created_at as last_message_at,
      latest.preview as last_preview, latest.direction as last_direction,
      totals.unread, totals.channels, driver_profile.name as driver_name
    from occurrence_conversations c
    left join identity_user_profiles driver_profile on driver_profile.user_id = c.driver_user_id
    left join occurrence_conversation_reads last_read
      on last_read.company_id = c.company_id and last_read.conversation_id = c.id
        and last_read.user_id = ${input.userId}::uuid
    left join occurrence_conversation_messages seen
      on seen.company_id = last_read.company_id and seen.id = last_read.last_read_message_id
    left join lateral (
      select m.created_at, left(m.body_text, ${DRIVER_SUBJECT_PREVIEW_LENGTH}) as preview, m.direction
      from occurrence_conversation_messages m
      where m.company_id = c.company_id and m.conversation_id = c.id
      order by m.created_at desc, m.id desc limit 1) latest on true
    left join lateral (
      select (count(*) filter (where m.direction = 'inbound'
          and (seen.id is null or (m.created_at, m.id) > (seen.created_at, seen.id))))::int as unread,
        coalesce(string_agg(distinct m.channel, ','), '') as channels
      from occurrence_conversation_messages m
      where m.company_id = c.company_id and m.conversation_id = c.id) totals on true
    where c.company_id = ${input.companyId}::uuid and c.participant = 'driver'
      and c.subject_type in (${OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT}, ${OCCURRENCE_CONVERSATION_SUBJECT.TRIP})
      and c.trip_id = ${input.tripId}::uuid and ${only}
    order by ${SORT_AT} desc, c.id desc
    limit ${OFFICE_SUBJECT_LIST_LIMIT}`)
}

/** `null` se a viagem não é da empresa: o 404 do BOLA, em vez de uma lista vazia. */
export async function listTripConversationRows(
  queryable: TripQueryable,
  input: ListInput,
): Promise<{ readonly rows: readonly OfficeSubjectRow[] } | null> {
  const [trip] = await queryable
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  if (trip === undefined) return null
  const raw = await readRawRows(queryable, input)
  const maps = await readSubjectFacts(queryable, {
    companyId: input.companyId,
    documentLinkIds: raw.flatMap((row) => row.trip_document_id ?? []),
    documentOccurrenceIds: [],
    stopOccurrenceIds: [],
    tripIds: raw.flatMap((row) =>
      row.subject_type === OCCURRENCE_CONVERSATION_SUBJECT.TRIP ? [row.trip_id] : [],
    ),
  })
  const rows = raw.flatMap((row): readonly OfficeSubjectRow[] => {
    const isTrip = row.subject_type === OCCURRENCE_CONVERSATION_SUBJECT.TRIP
    const subjectId = isTrip ? row.trip_id : row.trip_document_id
    const facts =
      subjectId === null ? undefined : (isTrip ? maps.trips : maps.documents).get(subjectId)
    if (subjectId === null || facts === undefined) return []
    return [
      {
        channels: row.channels === '' ? [] : row.channels.split(','),
        conversationId: row.conversation_id,
        documentReleasedAt: facts.documentReleasedAt,
        driverName: row.driver_name,
        iconName: null,
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
  return { rows }
}
