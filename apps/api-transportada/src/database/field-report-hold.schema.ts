/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, userCompanyMemberships } from './identity.schema.js'
import { tripDocuments } from './trip.schema.js'

export const FIELD_REPORT_HOLD_STATES = {
  discarded: 'discarded',
  held: 'held',
  released: 'released',
} as const

export type FieldReportHoldState =
  (typeof FIELD_REPORT_HOLD_STATES)[keyof typeof FIELD_REPORT_HOLD_STATES]

/**
 * Spec 320 D8: o interruptor por empresa. Uma linha por empresa; a ausência da linha é resposta válida: desligado,
 * o comportamento de antes da spec. Tabela própria, para o "voltar ao padrão" de outro painel não apagá-lo.
 */
export const companyFieldReportHoldSettings = pgTable(
  'company_field_report_hold_settings',
  {
    companyId: uuid('company_id').primaryKey(),
    holdEnabled: boolean('hold_enabled').notNull().default(false),
    /** Sem chave estrangeira de propósito: é rastro de quem ligou, e apagar o usuário não apaga o rastro. */
    updatedByUserId: uuid('updated_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_field_report_hold_settings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)

/**
 * Spec 320 RF1: a ocorrência do app cujo toque não é do dia em que chegou. O corpo já validado fica em `payload`
 * (sem binário: a foto e a assinatura já estão no storage, só o id viaja) e é o que "Liberar" reaplica pelo caminho
 * normal, com a hora do toque. A chave de idempotência é a do app: o reenvio da mesma chave devolve esta linha.
 */
export const tripFieldReportHolds = pgTable(
  'trip_field_report_holds',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    operation: text().notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    tripDocumentId: uuid('trip_document_id'),
    stopId: uuid('stop_id'),
    payload: jsonb().notNull(),
    tappedAt: timestamp('tapped_at', { withTimezone: true }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    state: text().notNull().default(FIELD_REPORT_HOLD_STATES.held).$type<FieldReportHoldState>(),
    /** D5: o registro que já cobre o mesmo fato, quando a busca achou. Sem chave estrangeira: aponta para tabelas diferentes. */
    probableDuplicateOf: text('probable_duplicate_of'),
    decidedByUserId: uuid('decided_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionReason: text('decision_reason'),
    /** O registro criado ao liberar, para o segundo "Liberar" devolver o mesmo e nunca duplicar (CA4). */
    releasedResultId: uuid('released_result_id'),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_field_report_holds_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'trip_field_report_holds_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripDocumentId],
      foreignColumns: [tripDocuments.companyId, tripDocuments.id],
      name: 'trip_field_report_holds_company_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trip_field_report_holds_company_key_unique').on(table.companyId, table.idempotencyKey),
    index('trip_field_report_holds_company_state_idx').on(
      table.companyId,
      table.state,
      table.receivedAt,
    ),
    check('trip_field_report_holds_key_check', sql`length(${table.idempotencyKey}) > 0`),
    check(
      'trip_field_report_holds_state_check',
      sql`${table.state} in ('held', 'released', 'discarded')`,
    ),
    check(
      'trip_field_report_holds_decision_check',
      sql`(${table.state} = 'held') = (${table.decidedAt} is null)`,
    ),
  ],
)
