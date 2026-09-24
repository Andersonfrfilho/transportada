/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF4/RF6/RF15: as leituras da conversa. Toda consulta leva `company_id`, e as três servem
 * a tela sem N+1: as conversas de uma ocorrência com as mensagens em ordem, a marcação de leitura
 * por usuário, e o resumo da página da listagem (estado da conversa com a contratante e mensagens
 * do motorista ainda não lidas por quem está vendo) em leituras fixas por página.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  identityUserProfiles,
  occurrenceConversationMessages,
  occurrenceConversationReads,
  occurrenceConversations,
} from '../../database/database.schema.js'
import { findTripOccurrenceFeedItem } from '../../trips/infrastructure/trip-occurrence-feed.query.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import { countUnread, readLastReads } from './occurrence-conversation-summary.query.js'
import type {
  OccurrenceConversationMessageAuthor,
  OccurrenceConversationMessageView,
  OccurrenceConversationsView,
} from '../application/occurrence-conversation.port.js'

const authorProfile = alias(identityUserProfiles, 'occurrence_conversation_author_profile')
const driverProfile = alias(identityUserProfiles, 'occurrence_conversation_driver_profile')

/** Uma conversa longa ainda cabe numa tela; paginação entra quando alguém chegar perto disto. */
const MESSAGE_LIMIT = 1000

type MessageRow = {
  readonly authorName: null | string
  readonly authorUserId: null | string
  readonly bodyText: string
  readonly channel: OccurrenceConversationMessageView['channel']
  readonly contractorContactId: null | string
  readonly conversationId: string
  readonly createdAt: Date
  readonly direction: OccurrenceConversationMessageView['direction']
  readonly driverName: null | string
  readonly driverUserId: null | string
  readonly id: string
  readonly senderAddress: null | string
  readonly status: OccurrenceConversationMessageView['status']
  readonly statusTimes: Record<string, string>
}

function toAuthor(row: MessageRow): OccurrenceConversationMessageAuthor {
  if (row.direction === 'outbound') {
    return { kind: 'operation', name: row.authorName, userId: row.authorUserId ?? '' }
  }
  if (row.driverUserId !== null) {
    return { kind: 'driver', name: row.driverName, userId: row.driverUserId }
  }
  return {
    contactId: row.contractorContactId,
    kind: 'contractor',
    name: row.authorName,
    senderAddress: row.senderAddress,
    userId: row.authorUserId,
  }
}

async function readMessages(
  queryable: TripQueryable,
  companyId: string,
  conversationIds: readonly string[],
): Promise<readonly MessageRow[]> {
  if (conversationIds.length === 0) return []
  return queryable
    .select({
      authorName: authorProfile.name,
      authorUserId: occurrenceConversationMessages.authorUserId,
      bodyText: occurrenceConversationMessages.bodyText,
      channel: occurrenceConversationMessages.channel,
      contractorContactId: occurrenceConversationMessages.contractorContactId,
      conversationId: occurrenceConversationMessages.conversationId,
      createdAt: occurrenceConversationMessages.createdAt,
      direction: occurrenceConversationMessages.direction,
      driverName: driverProfile.name,
      driverUserId: occurrenceConversationMessages.driverUserId,
      id: occurrenceConversationMessages.id,
      senderAddress: occurrenceConversationMessages.senderAddress,
      status: occurrenceConversationMessages.status,
      statusTimes: occurrenceConversationMessages.statusTimes,
    })
    .from(occurrenceConversationMessages)
    .leftJoin(authorProfile, eq(authorProfile.userId, occurrenceConversationMessages.authorUserId))
    .leftJoin(driverProfile, eq(driverProfile.userId, occurrenceConversationMessages.driverUserId))
    .where(
      and(
        eq(occurrenceConversationMessages.companyId, companyId),
        inArray(occurrenceConversationMessages.conversationId, [...conversationIds]),
      ),
    )
    .orderBy(asc(occurrenceConversationMessages.createdAt), asc(occurrenceConversationMessages.id))
    .limit(MESSAGE_LIMIT)
}

export async function findOccurrenceConversations(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string; readonly userId: string },
): Promise<OccurrenceConversationsView | null> {
  const item = await findTripOccurrenceFeedItem(queryable, input)
  if (item === null) return null

  const conversations = await queryable
    .select({
      id: occurrenceConversations.id,
      participant: occurrenceConversations.participant,
      status: occurrenceConversations.status,
    })
    .from(occurrenceConversations)
    .where(
      and(
        eq(occurrenceConversations.companyId, input.companyId),
        eq(occurrenceConversations.occurrenceKind, item.source),
        eq(occurrenceConversations.occurrenceId, input.occurrenceId),
      ),
    )
    .orderBy(asc(occurrenceConversations.participant))
  const conversationIds = conversations.map((conversation) => conversation.id)
  const [messages, lastReads] = await Promise.all([
    readMessages(queryable, input.companyId, conversationIds),
    readLastReads(queryable, { ...input, conversationIds }),
  ])

  return {
    conversations: conversations.map((conversation) => {
      const own = messages.filter((message) => message.conversationId === conversation.id)
      return {
        id: conversation.id,
        messages: own.map((row) => ({
          author: toAuthor(row),
          bodyText: row.bodyText,
          channel: row.channel,
          createdAt: row.createdAt.toISOString(),
          direction: row.direction,
          id: row.id,
          status: row.status,
          statusTimes: row.statusTimes,
        })),
        participant: conversation.participant,
        status: conversation.status,
        unreadCount: countUnread(own, lastReads.get(conversation.id) ?? null),
      }
    }),
  }
}

/** RF15: até a última mensagem da conversa, por usuário; o registro é da empresa do contexto. */
export async function markOccurrenceConversationRead(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly conversationId: string; readonly userId: string },
): Promise<boolean> {
  const [conversation] = await queryable
    .select({ id: occurrenceConversations.id })
    .from(occurrenceConversations)
    .where(
      and(
        eq(occurrenceConversations.companyId, input.companyId),
        eq(occurrenceConversations.id, input.conversationId),
      ),
    )
    .limit(1)
  if (conversation === undefined) return false

  const [last] = await queryable
    .select({ id: occurrenceConversationMessages.id })
    .from(occurrenceConversationMessages)
    .where(
      and(
        eq(occurrenceConversationMessages.companyId, input.companyId),
        eq(occurrenceConversationMessages.conversationId, input.conversationId),
      ),
    )
    .orderBy(
      sql`${occurrenceConversationMessages.createdAt} desc`,
      sql`${occurrenceConversationMessages.id} desc`,
    )
    .limit(1)
  if (last === undefined) return true

  await queryable
    .insert(occurrenceConversationReads)
    .values({
      companyId: input.companyId,
      conversationId: input.conversationId,
      lastReadMessageId: last.id,
      userId: input.userId,
    })
    .onConflictDoUpdate({
      set: { lastReadMessageId: last.id, readAt: sql`now()` },
      target: [
        occurrenceConversationReads.companyId,
        occurrenceConversationReads.conversationId,
        occurrenceConversationReads.userId,
      ],
    })
  return true
}
