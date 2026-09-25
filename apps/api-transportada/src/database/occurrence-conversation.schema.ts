/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 (ADR-0072): a ocorrência tem duas conversas — com a contratante e com o motorista —, uma
 * por participante, por qualquer canal. Toda FK leva `company_id`: a FK simples aceitaria amarrar a
 * conversa de uma empresa à contratante ou ao contato de outra, porque as duas linhas existem.
 *
 * ⚠️ **A conversa não decide** (D4): nenhuma coluna daqui é lida pela tratativa da spec 164, pelo
 * acerto nem pela cobrança. A decisão continua nas rotas e na política de lá.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { contractorContacts, contractorMailMessages } from './contractor-mail.schema.js'
import { contractors } from './delivery-client.schema.js'
import { companies, identityUsers } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import { storedObjects } from './storage.schema.js'

/** As duas fontes da listagem de ocorrências (`trip_stop_occurrences`, `trip_document_occurrences`). */
export const OCCURRENCE_CONVERSATION_KINDS = ['stop', 'document'] as const
export type OccurrenceConversationKind = (typeof OCCURRENCE_CONVERSATION_KINDS)[number]

export const OCCURRENCE_CONVERSATION_PARTICIPANTS = ['contractor', 'driver'] as const
export type OccurrenceConversationParticipant =
  (typeof OCCURRENCE_CONVERSATION_PARTICIPANTS)[number]

export const OCCURRENCE_CONVERSATION_STATUSES = ['open', 'closed'] as const
export type OccurrenceConversationStatus = (typeof OCCURRENCE_CONVERSATION_STATUSES)[number]

/** RF6/D9: `portal` só na conversa com a contratante; `app` só na do motorista (a política cuida). */
export const OCCURRENCE_CONVERSATION_CHANNELS = ['email', 'whatsapp', 'app', 'portal'] as const
export type OccurrenceConversationChannel = (typeof OCCURRENCE_CONVERSATION_CHANNELS)[number]

export const OCCURRENCE_CONVERSATION_DIRECTIONS = ['inbound', 'outbound'] as const
export type OccurrenceConversationDirection = (typeof OCCURRENCE_CONVERSATION_DIRECTIONS)[number]

/** RF14: a união dos estados dos quatro canais; o que cada canal alcança é da política (T402). */
export const OCCURRENCE_CONVERSATION_MESSAGE_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'bounced',
] as const
export type OccurrenceConversationMessageStatus =
  (typeof OCCURRENCE_CONVERSATION_MESSAGE_STATUSES)[number]

/** O que chegou sem conversa certa (RF9) só vem de canal externo. */
export const OCCURRENCE_CONVERSATION_UNASSIGNED_CHANNELS = ['email', 'whatsapp'] as const
export type OccurrenceConversationUnassignedChannel =
  (typeof OCCURRENCE_CONVERSATION_UNASSIGNED_CHANNELS)[number]

export const occurrenceConversations = pgTable(
  'occurrence_conversations',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    occurrenceKind: text('occurrence_kind').$type<OccurrenceConversationKind>().notNull(),
    /**
     * Sem FK, como `trip_occurrence_cases`: a ocorrência vive em duas tabelas, e `occurrence_kind`
     * diz qual. Quem abre a conversa confere a ocorrência dentro da empresa antes.
     */
    occurrenceId: uuid('occurrence_id').notNull(),
    participant: text().$type<OccurrenceConversationParticipant>().notNull(),
    contractorId: uuid('contractor_id'),
    /** O usuário do motorista (vínculo ativo): é por ele que o app e o WhatsApp verificado chegam. */
    driverUserId: uuid('driver_user_id'),
    /**
     * RF21: referência aleatória, só da conversa com a contratante, que o portal usa no lugar do id
     * interno. Única na instalação — o portal resolve a empresa pelo recorte do usuário, não por ela.
     */
    publicRef: text('public_ref'),
    status: text().$type<OccurrenceConversationStatus>().notNull().default('open'),
    /** O canal que a aba abre selecionado; `null` segue o preferido do contato. */
    defaultChannel: text('default_channel').$type<OccurrenceConversationChannel>(),
    /** RF20: o início da janela do WhatsApp cujo aviso de expiração já saiu (idempotência do job). */
    windowExpiryNoticeSentFor: timestamp('window_expiry_notice_sent_for', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('occurrence_conversations_company_id_id_unique').on(table.companyId, table.id),
    unique('occurrence_conversations_occurrence_participant_unique').on(
      table.companyId,
      table.occurrenceKind,
      table.occurrenceId,
      table.participant,
    ),
    unique('occurrence_conversations_public_ref_unique').on(table.publicRef),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'occurrence_conversations_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'occurrence_conversations_contractor_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.driverUserId],
      foreignColumns: [identityUsers.id],
      name: 'occurrence_conversations_driver_user_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'occurrence_conversations_occurrence_kind_check',
      sql`${table.occurrenceKind} in (${sql.raw(inList(OCCURRENCE_CONVERSATION_KINDS))})`,
    ),
    check(
      'occurrence_conversations_participant_check',
      sql`${table.participant} in (${sql.raw(inList(OCCURRENCE_CONVERSATION_PARTICIPANTS))})`,
    ),
    check(
      'occurrence_conversations_status_check',
      sql`${table.status} in (${sql.raw(inList(OCCURRENCE_CONVERSATION_STATUSES))})`,
    ),
    check(
      'occurrence_conversations_default_channel_check',
      sql`${table.defaultChannel} is null or ${table.defaultChannel} in (${sql.raw(inList(OCCURRENCE_CONVERSATION_CHANNELS))})`,
    ),
    /** A contratante tem contratante e referência do portal; o motorista, o usuário dele — nunca os dois. */
    check(
      'occurrence_conversations_participant_shape_check',
      sql`(${table.participant} = 'contractor' and ${table.contractorId} is not null and ${table.publicRef} is not null and ${table.driverUserId} is null)
        or (${table.participant} = 'driver' and ${table.driverUserId} is not null and ${table.contractorId} is null and ${table.publicRef} is null)`,
    ),
    check(
      'occurrence_conversations_public_ref_check',
      sql`${table.publicRef} is null or ${table.publicRef} ~ '^[A-Za-z0-9_-]{22,64}$'`,
    ),
  ],
)

export const occurrenceConversationMessages = pgTable(
  'occurrence_conversation_messages',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    channel: text().$type<OccurrenceConversationChannel>().notNull(),
    direction: text().$type<OccurrenceConversationDirection>().notNull(),
    /** Enviada: o operador. Recebida pelo portal: a conta do portal da contratante (D9). */
    authorUserId: uuid('author_user_id'),
    /** Recebida do contato da contratante reconhecido na escrita (WhatsApp com aceite, D6). */
    contractorContactId: uuid('contractor_contact_id'),
    /** Recebida do motorista (app ou WhatsApp verificado). */
    driverUserId: uuid('driver_user_id'),
    /**
     * RF16: o endereço ou número **como chegou**, histórico imutável. O casamento com o cadastro de
     * contatos é feito na leitura — editar o contato atualiza as mensagens antigas. Nunca vai a log.
     */
    senderAddress: text('sender_address'),
    bodyText: text('body_text').notNull().default(''),
    /** RF14: só a enviada tem status de entrega; a recebida tem a leitura por usuário (RF15). */
    status: text().$type<OccurrenceConversationMessageStatus>(),
    /** O horário de cada transição, `{ "sent": "<iso>", ... }` — o toque no selo mostra. */
    statusTimes: jsonb('status_times').$type<Record<string, string>>().notNull().default({}),
    /** RF7: a mensagem da 143 que levou este e-mail (thread, token, outbox continuam lá). */
    mailMessageId: uuid('mail_message_id'),
    /** RF8: o id opaco da Meta, sem FK para o schema `meta_whatsapp`; é por ele que o status chega. */
    providerMessageId: text('provider_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('occurrence_conversation_messages_company_id_id_unique').on(table.companyId, table.id),
    /** O status do provedor é idempotente pelo id dele, dentro do canal. */
    unique('occurrence_conversation_messages_provider_message_unique').on(
      table.companyId,
      table.channel,
      table.providerMessageId,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'occurrence_conversation_messages_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.conversationId],
      foreignColumns: [occurrenceConversations.companyId, occurrenceConversations.id],
      name: 'occurrence_conversation_messages_conversation_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorContactId],
      foreignColumns: [contractorContacts.companyId, contractorContacts.id],
      name: 'occurrence_conversation_messages_contractor_contact_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.mailMessageId],
      foreignColumns: [contractorMailMessages.companyId, contractorMailMessages.id],
      name: 'occurrence_conversation_messages_mail_message_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.authorUserId],
      foreignColumns: [identityUsers.id],
      name: 'occurrence_conversation_messages_author_user_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.driverUserId],
      foreignColumns: [identityUsers.id],
      name: 'occurrence_conversation_messages_driver_user_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'occurrence_conversation_messages_channel_check',
      sql`${table.channel} in (${sql.raw(inList(OCCURRENCE_CONVERSATION_CHANNELS))})`,
    ),
    check(
      'occurrence_conversation_messages_direction_check',
      sql`${table.direction} in (${sql.raw(inList(OCCURRENCE_CONVERSATION_DIRECTIONS))})`,
    ),
    /**
     * Enviada: só o operador, nenhum autor externo. Recebida: exatamente um autor — o motorista, a
     * conta do portal (só no canal `portal`) ou o endereço como chegou (e-mail e WhatsApp).
     */
    check(
      'occurrence_conversation_messages_author_check',
      sql`(${table.direction} = 'outbound' and ${table.authorUserId} is not null and ${table.driverUserId} is null and ${table.senderAddress} is null and ${table.contractorContactId} is null)
        or (${table.direction} = 'inbound' and num_nonnulls(${table.authorUserId}, ${table.driverUserId}, ${table.senderAddress}) = 1
          and (${table.authorUserId} is null or ${table.channel} = 'portal')
          and (${table.senderAddress} is null or ${table.channel} in ('email', 'whatsapp')))`,
    ),
    check(
      'occurrence_conversation_messages_status_check',
      sql`${table.status} is null or ${table.status} in (${sql.raw(inList(OCCURRENCE_CONVERSATION_MESSAGE_STATUSES))})`,
    ),
    check(
      'occurrence_conversation_messages_status_direction_check',
      sql`(${table.direction} = 'outbound') = (${table.status} is not null)`,
    ),
    /** D7: o e-mail não tem confirmação de leitura, e o selo nunca mostra o que o canal não dá. */
    check(
      'occurrence_conversation_messages_email_never_read_check',
      sql`${table.channel} <> 'email' or ${table.status} is null or ${table.status} <> 'read'`,
    ),
    /** Portal: gravada é disponível — `delivered` ou `read`, nada antes nem de falha. */
    check(
      'occurrence_conversation_messages_portal_status_check',
      sql`${table.channel} <> 'portal' or ${table.status} is null or ${table.status} in ('delivered', 'read')`,
    ),
    check(
      'occurrence_conversation_messages_body_length_check',
      sql`length(${table.bodyText}) <= 8000`,
    ),
    index('occurrence_conversation_messages_conversation_created_idx').on(
      table.companyId,
      table.conversationId,
      table.createdAt,
      table.id,
    ),
  ],
)

export const occurrenceConversationAttachments = pgTable(
  'occurrence_conversation_attachments',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    messageId: uuid('message_id').notNull(),
    storedObjectId: uuid('stored_object_id').notNull(),
    sha256: text().notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    contentType: text('content_type').notNull(),
    /** Nome para o operador baixar; nunca vai a log (regra da spec). */
    fileName: text('file_name').notNull().default(''),
    /** RF17: duração do áudio; `null` em documento e imagem. */
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('occurrence_conversation_attachments_company_id_id_unique').on(
      table.companyId,
      table.id,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'occurrence_conversation_attachments_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.messageId],
      foreignColumns: [occurrenceConversationMessages.companyId, occurrenceConversationMessages.id],
      name: 'occurrence_conversation_attachments_message_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.storedObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'occurrence_conversation_attachments_stored_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'occurrence_conversation_attachments_sha256_check',
      sql`${table.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check('occurrence_conversation_attachments_size_check', sql`${table.sizeBytes} > 0`),
    check(
      'occurrence_conversation_attachments_duration_check',
      sql`${table.durationMs} is null or ${table.durationMs} > 0`,
    ),
    index('occurrence_conversation_attachments_message_idx').on(table.companyId, table.messageId),
  ],
)

/** RF15: a última mensagem que cada usuário viu na conversa; abrir a aba não avisa a outra parte. */
export const occurrenceConversationReads = pgTable(
  'occurrence_conversation_reads',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    userId: uuid('user_id').notNull(),
    lastReadMessageId: uuid('last_read_message_id').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('occurrence_conversation_reads_user_unique').on(
      table.companyId,
      table.conversationId,
      table.userId,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'occurrence_conversation_reads_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.conversationId],
      foreignColumns: [occurrenceConversations.companyId, occurrenceConversations.id],
      name: 'occurrence_conversation_reads_conversation_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.lastReadMessageId],
      foreignColumns: [occurrenceConversationMessages.companyId, occurrenceConversationMessages.id],
      name: 'occurrence_conversation_reads_message_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [identityUsers.id],
      name: 'occurrence_conversation_reads_user_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)

/**
 * RF9: o que chegou de um contato com mais de uma conversa aberta e sem referência de resposta. O
 * operador escolhe a conversa; atribuir cria a mensagem lá e grava quem e quando aqui. Nunca por
 * palpite.
 */
export const occurrenceConversationUnassigned = pgTable(
  'occurrence_conversation_unassigned',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    channel: text().$type<OccurrenceConversationUnassignedChannel>().notNull(),
    contractorContactId: uuid('contractor_contact_id'),
    senderAddress: text('sender_address').notNull(),
    bodyText: text('body_text').notNull().default(''),
    providerMessageId: text('provider_message_id'),
    mailMessageId: uuid('mail_message_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    assignedMessageId: uuid('assigned_message_id'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    assignedByUserId: uuid('assigned_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('occurrence_conversation_unassigned_company_id_id_unique').on(table.companyId, table.id),
    unique('occurrence_conversation_unassigned_provider_message_unique').on(
      table.companyId,
      table.channel,
      table.providerMessageId,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'occurrence_conversation_unassigned_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorContactId],
      foreignColumns: [contractorContacts.companyId, contractorContacts.id],
      name: 'occurrence_conversation_unassigned_contractor_contact_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.mailMessageId],
      foreignColumns: [contractorMailMessages.companyId, contractorMailMessages.id],
      name: 'occurrence_conversation_unassigned_mail_message_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.assignedMessageId],
      foreignColumns: [occurrenceConversationMessages.companyId, occurrenceConversationMessages.id],
      name: 'occurrence_conversation_unassigned_assigned_message_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.assignedByUserId],
      foreignColumns: [identityUsers.id],
      name: 'occurrence_conversation_unassigned_assigned_by_user_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'occurrence_conversation_unassigned_channel_check',
      sql`${table.channel} in (${sql.raw(inList(OCCURRENCE_CONVERSATION_UNASSIGNED_CHANNELS))})`,
    ),
    /** Atribuída tem os três juntos: a mensagem criada, quando e por quem. */
    check(
      'occurrence_conversation_unassigned_assignment_check',
      sql`num_nonnulls(${table.assignedMessageId}, ${table.assignedAt}, ${table.assignedByUserId}) in (0, 3)`,
    ),
    index('occurrence_conversation_unassigned_open_idx')
      .on(table.companyId, table.receivedAt)
      .where(sql`${table.assignedMessageId} is null`),
  ],
)

/** Spec 183 T701 (RF12): para quem a resposta rápida é escrita — a mesma divisão das abas. */
export const COMPANY_QUICK_REPLY_AUDIENCES = OCCURRENCE_CONVERSATION_PARTICIPANTS
export type CompanyQuickReplyAudience = OccurrenceConversationParticipant

/** O teto do texto de uma resposta rápida (RF12): é um começo de mensagem, não um modelo. */
export const COMPANY_QUICK_REPLY_MAX_LENGTH = 500

/**
 * Spec 183 T701 (RF12): as respostas rápidas da empresa, por público, ordenáveis e ativáveis. A
 * resposta desativada fica (quem a escreveu pode religar), mas some do compositor. Nada aqui decide:
 * é texto que o operador ainda edita antes de mandar (D4).
 */
export const companyQuickReplies = pgTable(
  'company_quick_replies',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    audience: text().$type<CompanyQuickReplyAudience>().notNull(),
    bodyText: text('body_text').notNull(),
    position: integer().notNull(),
    active: boolean().notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_quick_replies_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'company_quick_replies_audience_check',
      sql`${table.audience} in (${sql.raw(inList(COMPANY_QUICK_REPLY_AUDIENCES))})`,
    ),
    check(
      'company_quick_replies_body_text_check',
      sql`char_length(btrim(${table.bodyText})) between 1 and ${sql.raw(String(COMPANY_QUICK_REPLY_MAX_LENGTH))}`,
    ),
    check('company_quick_replies_position_check', sql`${table.position} >= 0`),
    index('company_quick_replies_audience_position_idx').on(
      table.companyId,
      table.audience,
      table.position,
    ),
  ],
)
