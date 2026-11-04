/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { fleetDrivers } from './fleet.schema.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

/** `open` até concluir, cancelar, vencer (tempo sem resposta) ou desistir (tentativas esgotadas). */
export const WHATSAPP_GROUP_REQUEST_STATUSES = [
  'open',
  'completed',
  'cancelled',
  'expired',
  'abandoned',
] as const
export type WhatsAppGroupRequestStatus = (typeof WHATSAPP_GROUP_REQUEST_STATUSES)[number]

/** Tempo sem resposta até o pedido vencer: padrão 10 min (spec 292 regra 5), configurável na empresa. */
export const WHATSAPP_GROUP_REQUEST_TIMEOUT_RANGE = { default: 600, max: 3600, min: 60 } as const

/**
 * Spec 292 T4: **o pedido aberto no grupo do motorista.** Um por vez por grupo: o índice único parcial
 * (`status = 'open'`) é a reserva atômica — duas chamadas quase juntas, só uma abre; a outra recebe
 * "há um pedido em andamento". O vencimento é preguiçoso: quem lê trata `expires_at` passado como
 * vencido e o fecha antes de abrir outro.
 *
 * `owner_number` é o dono (quem marcou o bot para abrir): só ele responde sem marcar (regra 4).
 * `step` e `state` são do fluxo do pedido (T5); `attempts` conta respostas não entendidas (regra 7).
 */
export const whatsappGroupRequests = pgTable(
  'whatsapp_group_requests',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    groupJid: text('group_jid').notNull(),
    ownerNumber: text('owner_number').notNull(),
    status: text().$type<WhatsAppGroupRequestStatus>().notNull().default('open'),
    step: text().notNull(),
    state: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    attempts: integer().notNull().default(0),
    timeoutSeconds: integer('timeout_seconds').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'whatsapp_group_requests_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'whatsapp_group_requests_company_driver_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('whatsapp_group_requests_company_id_unique').on(table.companyId, table.id),
    uniqueIndex('whatsapp_group_requests_company_group_open_unique')
      .on(table.companyId, table.groupJid)
      .where(sql`${table.status} = 'open'`),
    index('whatsapp_group_requests_company_group_opened_idx').on(
      table.companyId,
      table.groupJid,
      table.openedAt,
    ),
    check(
      'whatsapp_group_requests_status_check',
      sql`${table.status} in (${sql.raw(inList(WHATSAPP_GROUP_REQUEST_STATUSES))})`,
    ),
    check(
      'whatsapp_group_requests_closed_check',
      sql`(${table.status} = 'open') = (${table.closedAt} is null)`,
    ),
    check(
      'whatsapp_group_requests_owner_number_check',
      sql`${table.ownerNumber} ~ '^[0-9]{8,20}$'`,
    ),
    check('whatsapp_group_requests_attempts_check', sql`${table.attempts} >= 0`),
    check(
      'whatsapp_group_requests_timeout_check',
      sql`${table.timeoutSeconds} between ${sql.raw(String(WHATSAPP_GROUP_REQUEST_TIMEOUT_RANGE.min))} and ${sql.raw(String(WHATSAPP_GROUP_REQUEST_TIMEOUT_RANGE.max))}`,
    ),
    check('whatsapp_group_requests_version_check', sql`${table.version} >= 1`),
  ],
)

/**
 * Spec 292 T4: cada mensagem do grupo que o bot aceitou, uma vez só pelo id do provedor — o Evolution
 * pode reentregar, e a mesma resposta não pode andar o pedido duas vezes. Guarda quem escreveu e por
 * qual caminho (marcação ou resposta do dono), para o histórico mostrar quem confirmou cada passo
 * (regra 11). O texto não fica aqui: o que é do pedido vai à conversa da ocorrência (T4b).
 */
export const whatsappGroupRequestMessages = pgTable(
  'whatsapp_group_request_messages',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    providerMessageId: text('provider_message_id').notNull(),
    requestId: uuid('request_id'),
    senderNumber: text('sender_number').notNull(),
    via: text().$type<'mention' | 'owner_reply'>().notNull(),
    stepBefore: text('step_before'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'whatsapp_group_request_messages_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.requestId],
      foreignColumns: [whatsappGroupRequests.companyId, whatsappGroupRequests.id],
      name: 'whatsapp_group_request_messages_request_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('whatsapp_group_request_messages_company_provider_unique').on(
      table.companyId,
      table.providerMessageId,
    ),
    index('whatsapp_group_request_messages_request_idx').on(table.companyId, table.requestId),
    check(
      'whatsapp_group_request_messages_via_check',
      sql`${table.via} in ('mention', 'owner_reply')`,
    ),
  ],
)
