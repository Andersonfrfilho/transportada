/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  WHATSAPP_CHAT_CONTENT_KINDS,
  WHATSAPP_CHAT_FAILURE_REASONS,
  WHATSAPP_CHAT_KINDS,
  WHATSAPP_CHAT_MESSAGE_AUTHORS,
  WHATSAPP_CHAT_MESSAGE_DIRECTIONS,
  WHATSAPP_CHAT_MESSAGE_STATUSES,
  WHATSAPP_CHAT_OPERATOR_TEXT_MAX_LENGTH,
  WHATSAPP_CHAT_RELEASE_REASONS,
  WHATSAPP_CHAT_STATES,
  WHATSAPP_DIRECT_JID_SOURCE,
  WHATSAPP_GROUP_JID_SOURCE,
  type WhatsAppChatContentKind,
  type WhatsAppChatFailureReason,
  type WhatsAppChatKind,
  type WhatsAppChatMessageAuthor,
  type WhatsAppChatMessageDirection,
  type WhatsAppChatMessageStatus,
  type WhatsAppChatReleaseReason,
  type WhatsAppChatState,
} from '../whatsapp-inbox/domain/whatsapp-chat.constant.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * Spec 319 T2 (RF1, RF6): **o chat do WhatsApp do número do bot, e quem o atende.** Um por empresa e JID: grupo
 * (`…@g.us`) ou privado (`<número>@s.whatsapp.net`, nunca `@lid` — T1). Módulo separado da ocorrência (RF8).
 *
 * - `state = 'operator'` ⇔ quem assumiu, quando e o vencimento preenchidos (CHECK). O vencimento é empurrado a cada
 *   mensagem do atendente; vencido, a leitura já trata como `bot` e o job da T7 grava a devolução.
 * - Assumir é `UPDATE … WHERE state = 'bot' OR expires_at <= now()` (atômico): o segundo atendente recebe quem segura.
 * - A devolução guarda o motivo, quem devolveu (nulo quando venceu) e quando, até o próximo assumir.
 * - `last_message_at`/`last_inbound_at`/`read_at` ordenam a lista e derivam o "não lido" (RF5).
 *
 * Nada de nome, número ou texto em log: o JID do privado é o número do motorista.
 */
export const whatsappChats = pgTable(
  'whatsapp_chats',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    chatJid: varchar('chat_jid', { length: 64 }).notNull(),
    kind: varchar({ length: 8 }).$type<WhatsAppChatKind>().notNull(),
    state: varchar({ length: 8 }).$type<WhatsAppChatState>().notNull().default('bot'),
    takenOverByUserId: uuid('taken_over_by_user_id'),
    takenOverAt: timestamp('taken_over_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releasedByUserId: uuid('released_by_user_id'),
    releaseReason: varchar('release_reason', { length: 8 }).$type<WhatsAppChatReleaseReason>(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'whatsapp_chats_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.takenOverByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'whatsapp_chats_taken_over_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.releasedByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'whatsapp_chats_released_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('whatsapp_chats_company_id_id_unique').on(table.companyId, table.id),
    unique('whatsapp_chats_company_jid_unique').on(table.companyId, table.chatJid),
    /** A lista da caixa (RF5): por empresa, o chat mais recente primeiro. */
    index('whatsapp_chats_company_last_message_idx').on(table.companyId, table.lastMessageAt),
    /** O job de vencimento (T7) só varre os assumidos. */
    index('whatsapp_chats_operator_expires_idx')
      .on(table.expiresAt)
      .where(sql`${table.state} = 'operator'`),
    check(
      'whatsapp_chats_kind_check',
      sql`${table.kind} in (${sql.raw(inList(WHATSAPP_CHAT_KINDS))})`,
    ),
    check(
      'whatsapp_chats_state_check',
      sql`${table.state} in (${sql.raw(inList(WHATSAPP_CHAT_STATES))})`,
    ),
    check(
      'whatsapp_chats_release_reason_check',
      sql`${table.releaseReason} is null or ${table.releaseReason} in (${sql.raw(inList(WHATSAPP_CHAT_RELEASE_REASONS))})`,
    ),
    /** O tipo é o do JID; `@lid` e qualquer outro sufixo não entram (T1: o privado é endereçado pelo número). */
    check(
      'whatsapp_chats_jid_check',
      sql`(${table.kind} = 'group' and ${table.chatJid} ~ ${sql.raw(`'${WHATSAPP_GROUP_JID_SOURCE}'`)})
        or (${table.kind} = 'direct' and ${table.chatJid} ~ ${sql.raw(`'${WHATSAPP_DIRECT_JID_SOURCE}'`)})`,
    ),
    /** RF1: assumido tem dono, início e vencimento; com o bot, nenhum dos três. */
    check(
      'whatsapp_chats_takeover_check',
      sql`(${table.state} = 'operator') = (${table.takenOverByUserId} is not null)
        and (${table.state} = 'operator') = (${table.takenOverAt} is not null)
        and (${table.state} = 'operator') = (${table.expiresAt} is not null)
        and (${table.expiresAt} is null or ${table.expiresAt} > ${table.takenOverAt})`,
    ),
    /** A devolução é do chat com o bot; o motivo e a hora andam juntos, e quem devolveu só existe na manual. */
    check(
      'whatsapp_chats_release_check',
      sql`(${table.releaseReason} is null) = (${table.releasedAt} is null)
        and (${table.releaseReason} is null or ${table.state} = 'bot')
        and (${table.releasedByUserId} is null or ${table.releaseReason} = 'manual')`,
    ),
  ],
)

/**
 * Spec 319 T2 (RF3, RF4): **o histórico do chat** — recebidas do motorista e do grupo, as do bot e as do atendente.
 *
 * - Autor e direção andam juntos (`WHATSAPP_CHAT_AUTHOR_DIRECTION`, CHECK); `operator` exige `author_user_id`.
 * - A enviada tem status (`queued` → `sent` → `delivered` → `read`, ou `failed` com motivo); a recebida não tem.
 * - `provider_message_id` é o `key.id` do Evolution, único por empresa: o eco do webhook é deduplicado por ele (T1),
 *   e é por ele que `messages.update` chega e que o `fromMe` do celular é separado do envio do painel (T9).
 * - `sender_phone` (só no grupo, quem escreveu) e o texto ficam só no banco: nunca em log.
 * - `occurred_at` é a hora da mensagem (a do provedor na recebida); a ordem do fio é `occurred_at, id`.
 */
export const whatsappChatMessages = pgTable(
  'whatsapp_chat_messages',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    chatId: uuid('chat_id').notNull(),
    direction: varchar({ length: 8 }).$type<WhatsAppChatMessageDirection>().notNull(),
    author: varchar({ length: 8 }).$type<WhatsAppChatMessageAuthor>().notNull(),
    authorUserId: uuid('author_user_id'),
    senderPhone: varchar('sender_phone', { length: 15 }),
    contentKind: varchar('content_kind', { length: 8 })
      .$type<WhatsAppChatContentKind>()
      .notNull()
      .default('text'),
    bodyText: text('body_text').notNull().default(''),
    providerMessageId: varchar('provider_message_id', { length: 128 }),
    status: varchar({ length: 12 }).$type<WhatsAppChatMessageStatus>(),
    failureReason: varchar('failure_reason', { length: 24 }).$type<WhatsAppChatFailureReason>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'whatsapp_chat_messages_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.chatId],
      foreignColumns: [whatsappChats.companyId, whatsappChats.id],
      name: 'whatsapp_chat_messages_company_chat_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.authorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'whatsapp_chat_messages_author_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('whatsapp_chat_messages_company_id_id_unique').on(table.companyId, table.id),
    /** T1: o eco do envio e a reentrega do webhook não duplicam. */
    uniqueIndex('whatsapp_chat_messages_company_provider_unique')
      .on(table.companyId, table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    /** O fio do chat (RF5), em ordem. */
    index('whatsapp_chat_messages_company_chat_occurred_idx').on(
      table.companyId,
      table.chatId,
      table.occurredAt,
    ),
    check(
      'whatsapp_chat_messages_direction_check',
      sql`${table.direction} in (${sql.raw(inList(WHATSAPP_CHAT_MESSAGE_DIRECTIONS))})`,
    ),
    check(
      'whatsapp_chat_messages_author_check',
      sql`${table.author} in (${sql.raw(inList(WHATSAPP_CHAT_MESSAGE_AUTHORS))})`,
    ),
    check(
      'whatsapp_chat_messages_content_kind_check',
      sql`${table.contentKind} in (${sql.raw(inList(WHATSAPP_CHAT_CONTENT_KINDS))})`,
    ),
    check(
      'whatsapp_chat_messages_status_check',
      sql`${table.status} is null or ${table.status} in (${sql.raw(inList(WHATSAPP_CHAT_MESSAGE_STATUSES))})`,
    ),
    check(
      'whatsapp_chat_messages_failure_reason_check',
      sql`${table.failureReason} is null or ${table.failureReason} in (${sql.raw(inList(WHATSAPP_CHAT_FAILURE_REASONS))})`,
    ),
    /** Recebida: motorista ou membro do grupo, sem status. Enviada: bot, atendente ou celular, sempre com status. */
    check(
      'whatsapp_chat_messages_author_direction_check',
      sql`(${table.direction} = 'inbound' and ${table.author} in ('driver', 'member') and ${table.status} is null)
        or (${table.direction} = 'outbound' and ${table.author} in ('bot', 'operator', 'phone') and ${table.status} is not null)`,
    ),
    /** Só o atendente tem conta; só a recebida tem o número de quem escreveu. */
    check(
      'whatsapp_chat_messages_author_user_check',
      sql`(${table.author} = 'operator') = (${table.authorUserId} is not null)
        and (${table.senderPhone} is null or (${table.direction} = 'inbound' and ${table.senderPhone} ~ '^[0-9]{8,15}$'))`,
    ),
    /** O motivo existe só na falha. */
    check(
      'whatsapp_chat_messages_failure_check',
      sql`(${table.status} = 'failed') = (${table.failureReason} is not null)`,
    ),
    /** Enviada pelo Evolution já tem id; só `queued` e `failed` podem não ter (fase 1 do envio, T1 §1). */
    check(
      'whatsapp_chat_messages_provider_id_check',
      sql`${table.providerMessageId} is not null or ${table.status} is null or ${table.status} in ('queued', 'failed')`,
    ),
    check(
      'whatsapp_chat_messages_operator_text_check',
      sql`${table.author} <> 'operator' or char_length(${table.bodyText}) between 1 and ${sql.raw(String(WHATSAPP_CHAT_OPERATOR_TEXT_MAX_LENGTH))}`,
    ),
  ],
)
