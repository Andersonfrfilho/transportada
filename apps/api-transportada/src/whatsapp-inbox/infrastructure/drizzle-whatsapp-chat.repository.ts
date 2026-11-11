/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, isNotNull, lt, lte, or, sql } from 'drizzle-orm'

import { auditLogs } from '../../database/database.schema.js'

import { whatsappChatMessages, whatsappChats } from '../../database/whatsapp-chat.schema.js'
import { whatsappEvolutionSettings } from '../../database/whatsapp-evolution.schema.js'
import type {
  WhatsAppChat,
  WhatsAppChatMessage,
  WhatsAppChatRepositoryPort,
} from '../application/whatsapp-chat.port.js'
import {
  initialWhatsAppChatMessageStatus,
  whatsAppChatMessageDirection,
  whatsAppChatStatusesAdvancingTo,
} from '../domain/whatsapp-chat-message.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const CHAT_COLUMNS = {
  chatJid: whatsappChats.chatJid,
  companyId: whatsappChats.companyId,
  createdAt: whatsappChats.createdAt,
  expiresAt: whatsappChats.expiresAt,
  id: whatsappChats.id,
  kind: whatsappChats.kind,
  lastInboundAt: whatsappChats.lastInboundAt,
  lastMessageAt: whatsappChats.lastMessageAt,
  readAt: whatsappChats.readAt,
  releaseReason: whatsappChats.releaseReason,
  releasedAt: whatsappChats.releasedAt,
  releasedByUserId: whatsappChats.releasedByUserId,
  state: whatsappChats.state,
  takenOverAt: whatsappChats.takenOverAt,
  takenOverByUserId: whatsappChats.takenOverByUserId,
}

const MESSAGE_COLUMNS = {
  author: whatsappChatMessages.author,
  authorUserId: whatsappChatMessages.authorUserId,
  bodyText: whatsappChatMessages.bodyText,
  chatId: whatsappChatMessages.chatId,
  companyId: whatsappChatMessages.companyId,
  contentKind: whatsappChatMessages.contentKind,
  direction: whatsappChatMessages.direction,
  failureReason: whatsappChatMessages.failureReason,
  id: whatsappChatMessages.id,
  occurredAt: whatsappChatMessages.occurredAt,
  providerMessageId: whatsappChatMessages.providerMessageId,
  senderPhone: whatsappChatMessages.senderPhone,
  status: whatsappChatMessages.status,
}

/** O retorno do chat de volta ao bot: limpa quem segurava. */
const BACK_TO_BOT = {
  expiresAt: null,
  state: 'bot' as const,
  takenOverAt: null,
  takenOverByUserId: null,
  updatedAt: sql`now()`,
}

/**
 * Spec 319 T2: o estado e o histórico do chat do WhatsApp, sempre por empresa. Módulo separado da ocorrência (RF8):
 * não importa nem cita as tabelas da conversa da ocorrência.
 */
export function createDrizzleWhatsAppChatRepository(
  database: Database,
): WhatsAppChatRepositoryPort {
  const chatOf = (companyId: string, chatId: string) =>
    and(eq(whatsappChats.companyId, companyId), eq(whatsappChats.id, chatId))

  const findChat = async (companyId: string, chatId: string): Promise<WhatsAppChat | null> => {
    const [row] = await database
      .select(CHAT_COLUMNS)
      .from(whatsappChats)
      .where(chatOf(companyId, chatId))
      .limit(1)
    return row ?? null
  }

  const findChatByJid = async (
    companyId: string,
    chatJid: string,
  ): Promise<WhatsAppChat | null> => {
    const [row] = await database
      .select(CHAT_COLUMNS)
      .from(whatsappChats)
      .where(and(eq(whatsappChats.companyId, companyId), eq(whatsappChats.chatJid, chatJid)))
      .limit(1)
    return row ?? null
  }

  const cursorOf = (value: string | null | undefined): { at: Date; id: string } | null => {
    if (value === null || value === undefined) return null
    const [at, id] = value.split('::')
    return at === undefined || id === undefined ? null : { at: new Date(at), id }
  }

  const sortKey = sql<Date>`coalesce(${whatsappChats.lastMessageAt}, ${whatsappChats.createdAt})`

  return {
    async listChats(input) {
      const after = cursorOf(input.cursor)
      const rows = await database
        .select(CHAT_COLUMNS)
        .from(whatsappChats)
        .where(
          and(
            eq(whatsappChats.companyId, input.companyId),
            input.state === undefined ? undefined : eq(whatsappChats.state, input.state),
            input.kind === undefined ? undefined : eq(whatsappChats.kind, input.kind),
            input.unreadOnly === true
              ? and(
                  isNotNull(whatsappChats.lastInboundAt),
                  or(
                    sql`${whatsappChats.readAt} is null`,
                    sql`${whatsappChats.readAt} < ${whatsappChats.lastInboundAt}`,
                  ),
                )
              : undefined,
            after === null
              ? undefined
              : or(
                  lt(sortKey, after.at),
                  and(eq(sortKey, after.at), lt(whatsappChats.id, after.id)),
                ),
          ),
        )
        .orderBy(desc(sortKey), desc(whatsappChats.id))
        .limit(input.limit + 1)
      const page = rows.slice(0, input.limit)
      const last = page.at(-1)
      const hasMore = rows.length > input.limit
      return {
        items: page,
        nextCursor:
          hasMore && last !== undefined
            ? `${(last.lastMessageAt ?? last.createdAt).toISOString()}::${last.id}`
            : null,
      }
    },

    async listMessages(input) {
      const after = cursorOf(input.cursor)
      const rows = await database
        .select(MESSAGE_COLUMNS)
        .from(whatsappChatMessages)
        .where(
          and(
            eq(whatsappChatMessages.companyId, input.companyId),
            eq(whatsappChatMessages.chatId, input.chatId),
            after === null
              ? undefined
              : or(
                  lt(whatsappChatMessages.occurredAt, after.at),
                  and(
                    eq(whatsappChatMessages.occurredAt, after.at),
                    lt(whatsappChatMessages.id, after.id),
                  ),
                ),
          ),
        )
        .orderBy(desc(whatsappChatMessages.occurredAt), desc(whatsappChatMessages.id))
        .limit(input.limit + 1)
      const page = rows.slice(0, input.limit) as WhatsAppChatMessage[]
      const last = page.at(-1)
      return {
        items: page,
        nextCursor:
          rows.length > input.limit && last !== undefined
            ? `${last.occurredAt.toISOString()}::${last.id}`
            : null,
      }
    },

    async markRead(input) {
      const [row] = await database
        .update(whatsappChats)
        .set({ readAt: input.now, updatedAt: sql`now()` })
        .where(chatOf(input.companyId, input.chatId))
        .returning(CHAT_COLUMNS)
      return row ?? null
    },

    async recordAudit(input) {
      await database.insert(auditLogs).values({
        action: input.action,
        actorUserId: input.actorUserId,
        afterSnapshot: { state: input.afterState },
        beforeSnapshot: { state: input.beforeState },
        companyId: input.companyId,
        correlationId: input.correlationId,
        entityId: input.chatId,
        entityType: 'whatsapp_chat',
        permission: 'occurrences.resolve',
        targetId: input.chatId,
        targetType: 'whatsapp_chat',
      })
    },

    async appendMessage(input) {
      const status = initialWhatsAppChatMessageStatus(input.author)
      return database.transaction(async (transaction) => {
        const [inserted] = await transaction
          .insert(whatsappChatMessages)
          .values({
            author: input.author,
            authorUserId: input.authorUserId ?? null,
            bodyText: input.bodyText,
            chatId: input.chatId,
            companyId: input.companyId,
            contentKind: input.contentKind ?? 'text',
            direction: whatsAppChatMessageDirection(input.author),
            providerMessageId: input.providerMessageId ?? null,
            senderPhone: input.senderPhone ?? null,
            status,
            ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
          })
          .onConflictDoNothing({
            target: [whatsappChatMessages.companyId, whatsappChatMessages.providerMessageId],
            where: sql`${whatsappChatMessages.providerMessageId} is not null`,
          })
          .returning(MESSAGE_COLUMNS)

        if (inserted === undefined) {
          const [existing] = await transaction
            .select(MESSAGE_COLUMNS)
            .from(whatsappChatMessages)
            .where(
              and(
                eq(whatsappChatMessages.companyId, input.companyId),
                eq(whatsappChatMessages.providerMessageId, input.providerMessageId ?? ''),
              ),
            )
            .limit(1)
          if (existing === undefined) throw new Error('whatsapp chat message conflict without row')
          return { message: existing, outcome: 'duplicate' as const }
        }

        const occurred = inserted.occurredAt
        await transaction
          .update(whatsappChats)
          .set({
            lastMessageAt: sql`greatest(coalesce(${whatsappChats.lastMessageAt}, ${occurred}), ${occurred})`,
            ...(inserted.direction === 'inbound'
              ? {
                  lastInboundAt: sql`greatest(coalesce(${whatsappChats.lastInboundAt}, ${occurred}), ${occurred})`,
                }
              : {}),
            updatedAt: sql`now()`,
          })
          .where(chatOf(input.companyId, input.chatId))
        return { message: inserted, outcome: 'inserted' as const }
      })
    },

    async ensureChat(input) {
      await database
        .insert(whatsappChats)
        .values({ chatJid: input.chatJid, companyId: input.companyId, kind: input.kind })
        .onConflictDoNothing({ target: [whatsappChats.companyId, whatsappChats.chatJid] })
      const chat = await findChatByJid(input.companyId, input.chatJid)
      if (chat === null) throw new Error('whatsapp chat missing after ensure')
      return chat
    },

    async expireDue(input) {
      // A CTE guarda quem segurava antes do SET; `skip locked` deixa duas réplicas do job varrerem sem se esperar.
      const rows = await database.execute<{
        readonly chat_id: string
        readonly company_id: string
        readonly user_id: string
      }>(sql`
        with due as (
          select id, taken_over_by_user_id
          from whatsapp_chats
          where state = 'operator' and expires_at <= ${input.now}::timestamptz
          order by expires_at
          limit ${input.limit}
          for update skip locked
        )
        update whatsapp_chats as chat
        set state = 'bot',
            taken_over_by_user_id = null,
            taken_over_at = null,
            expires_at = null,
            release_reason = 'expired',
            released_at = ${input.now}::timestamptz,
            released_by_user_id = null,
            updated_at = now()
        from due
        where chat.id = due.id
        returning chat.id as chat_id, chat.company_id, due.taken_over_by_user_id as user_id
      `)
      return rows.map((row) => ({
        chatId: row.chat_id,
        companyId: row.company_id,
        userId: row.user_id,
      }))
    },

    async extendTakeover(input) {
      const [row] = await database
        .update(whatsappChats)
        .set({ expiresAt: input.expiresAt, updatedAt: sql`now()` })
        .where(
          and(
            chatOf(input.companyId, input.chatId),
            eq(whatsappChats.state, 'operator'),
            eq(whatsappChats.takenOverByUserId, input.userId),
            sql`${whatsappChats.expiresAt} > ${input.now}`,
          ),
        )
        .returning(CHAT_COLUMNS)
      return row ?? null
    },

    async findChat(input) {
      return findChat(input.companyId, input.chatId)
    },

    async findChatByJid(input) {
      return findChatByJid(input.companyId, input.chatJid)
    },

    async findMessage(input) {
      const [row] = await database
        .select(MESSAGE_COLUMNS)
        .from(whatsappChatMessages)
        .where(
          and(
            eq(whatsappChatMessages.companyId, input.companyId),
            eq(whatsappChatMessages.chatId, input.chatId),
            eq(whatsappChatMessages.id, input.messageId),
          ),
        )
        .limit(1)
      return (row as WhatsAppChatMessage | undefined) ?? null
    },

    async findTakeoverTimeoutSeconds(input) {
      const [row] = await database
        .select({ seconds: whatsappEvolutionSettings.chatTakeoverTimeoutSeconds })
        .from(whatsappEvolutionSettings)
        .where(eq(whatsappEvolutionSettings.companyId, input.companyId))
        .limit(1)
      return row?.seconds ?? null
    },

    async release(input) {
      const [row] = await database
        .update(whatsappChats)
        .set({
          ...BACK_TO_BOT,
          releaseReason: 'manual',
          releasedAt: input.now,
          releasedByUserId: input.userId,
        })
        .where(and(chatOf(input.companyId, input.chatId), eq(whatsappChats.state, 'operator')))
        .returning(CHAT_COLUMNS)
      if (row !== undefined) return { chat: row, outcome: 'released' }
      const chat = await findChat(input.companyId, input.chatId)
      return chat === null ? { outcome: 'not_found' } : { chat, outcome: 'already_bot' }
    },

    async takeOver(input) {
      const stillHeldByMe = sql`${whatsappChats.state} = 'operator' and ${whatsappChats.takenOverByUserId} = ${input.userId} and ${whatsappChats.expiresAt} > ${input.now}`
      const [row] = await database
        .update(whatsappChats)
        .set({
          expiresAt: input.expiresAt,
          releaseReason: null,
          releasedAt: null,
          releasedByUserId: null,
          state: 'operator',
          takenOverAt: sql`case when ${stillHeldByMe} then ${whatsappChats.takenOverAt} else ${input.now}::timestamptz end`,
          takenOverByUserId: input.userId,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            chatOf(input.companyId, input.chatId),
            or(
              eq(whatsappChats.state, 'bot'),
              lte(whatsappChats.expiresAt, input.now),
              eq(whatsappChats.takenOverByUserId, input.userId),
            ),
          ),
        )
        .returning(CHAT_COLUMNS)
      if (row !== undefined) {
        const renewed =
          row.takenOverAt !== null && row.takenOverAt.getTime() !== input.now.getTime()
        return { chat: row, outcome: renewed ? 'renewed' : 'taken' }
      }
      const chat = await findChat(input.companyId, input.chatId)
      if (chat === null) return { outcome: 'not_found' }
      if (chat.takenOverByUserId === null || chat.expiresAt === null) {
        // Devolvido entre o UPDATE e a leitura: quem chama pode tentar de novo; nunca finge que assumiu.
        throw new Error('whatsapp chat changed during take over')
      }
      return {
        expiresAt: chat.expiresAt,
        holderUserId: chat.takenOverByUserId,
        outcome: 'held',
      }
    },

    async updateMessageStatus(input) {
      const allowedFrom = whatsAppChatStatusesAdvancingTo(input.status)
      if (allowedFrom.length === 0) return null
      const target =
        input.messageId === undefined
          ? eq(whatsappChatMessages.providerMessageId, input.providerMessageId)
          : eq(whatsappChatMessages.id, input.messageId)
      const providerMessageId =
        input.messageId !== undefined && input.providerMessageId !== undefined
          ? input.providerMessageId
          : undefined
      const [row] = await database
        .update(whatsappChatMessages)
        .set({
          failureReason: input.status === 'failed' ? (input.failureReason ?? 'failed') : null,
          status: input.status,
          updatedAt: sql`now()`,
          ...(providerMessageId === undefined || providerMessageId === null
            ? {}
            : { providerMessageId }),
        })
        .where(
          and(
            eq(whatsappChatMessages.companyId, input.companyId),
            target,
            isNotNull(whatsappChatMessages.status),
            inArray(whatsappChatMessages.status, [...allowedFrom]),
          ),
        )
        .returning(MESSAGE_COLUMNS)
      return (row as WhatsAppChatMessage | undefined) ?? null
    },
  }
}
