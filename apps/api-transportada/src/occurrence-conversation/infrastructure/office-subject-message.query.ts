/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b: as mensagens da conversa de nota e de viagem vistas pelo escritório. O autor é o nome de
 * quem escreveu, nos dois sentidos — operação (`author_user_id`) ou motorista (`driver_user_id`).
 */
import { and, desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  identityUserProfiles,
  occurrenceConversationMessages,
} from '../../database/database.schema.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'

const authorProfile = alias(identityUserProfiles, 'office_subject_author_profile')
const driverProfile = alias(identityUserProfiles, 'office_subject_driver_profile')
const messages = occurrenceConversationMessages

function selectMessages(queryable: TripQueryable) {
  return queryable
    .select({
      authorName: sql<null | string>`coalesce(${authorProfile.name}, ${driverProfile.name})`,
      bodyText: messages.bodyText,
      channel: messages.channel,
      clientMessageId: messages.clientMessageId,
      createdAt: messages.createdAt,
      direction: messages.direction,
      id: messages.id,
      status: messages.status,
    })
    .from(messages)
    .leftJoin(authorProfile, eq(authorProfile.userId, messages.authorUserId))
    .leftJoin(driverProfile, eq(driverProfile.userId, messages.driverUserId))
}

export async function listOfficeMessages(
  queryable: TripQueryable,
  input: {
    readonly before: null | string
    readonly companyId: string
    readonly conversationId: string
    readonly limit: number
  },
) {
  const olderThanBefore =
    input.before === null
      ? sql`true`
      : sql`(${messages.createdAt}, ${messages.id}) < (
          select anchor.created_at, anchor.id from occurrence_conversation_messages anchor
          where anchor.company_id = ${input.companyId}
            and anchor.conversation_id = ${input.conversationId}::uuid
            and anchor.id = ${input.before}::uuid)`
  const newestFirst = await selectMessages(queryable)
    .where(
      and(
        eq(messages.companyId, input.companyId),
        eq(messages.conversationId, input.conversationId),
        olderThanBefore,
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(input.limit)
  return newestFirst.toReversed()
}

export async function findOfficeMessage(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly conversationId: string
    readonly messageId: string
  },
) {
  const [row] = await selectMessages(queryable)
    .where(
      and(
        eq(messages.companyId, input.companyId),
        eq(messages.conversationId, input.conversationId),
        eq(messages.id, input.messageId),
      ),
    )
    .limit(1)
  return row ?? null
}
