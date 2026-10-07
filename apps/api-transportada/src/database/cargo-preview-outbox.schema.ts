/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  CARGO_PREVIEW_OUTBOX_EVENT,
  CARGO_PREVIEW_OUTBOX_EVENTS,
  type CargoPreviewOutboxEvent,
} from '../shared/cargo-preview.constant.js'
import { cargoPreviews } from './cargo-preview.schema.js'
import { contractors } from './delivery-client.schema.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)
const withTimezone = { withTimezone: true } as const

/**
 * Spec 237 Fase 4a (ADR-0007): o pedido ao worker, gravado na mesma transação de quem o causa —
 * `process` com a prévia enviada, `reevaluate` com a nota importada do emitente do contratante. Não
 * é o `processing_outbox`: lá o agregado é `nfe_import` por CHECK e FK, e o ator é obrigatório.
 *
 * O `reevaluate` é coalescido por contratante: enquanto houver um pendente, a importação seguinte
 * não grava outro, e o `next_attempt_at` adiado junta o lote inteiro numa só reavaliação.
 */
export const cargoPreviewOutbox = pgTable(
  'cargo_preview_outbox',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    previewId: uuid('preview_id'),
    eventType: varchar('event_type', { length: 40 }).$type<CargoPreviewOutboxEvent>().notNull(),
    eventVersion: bigint('event_version', { mode: 'bigint' }).notNull().default(1n),
    correlationId: text('correlation_id').notNull(),
    /** Referência, nunca bytes nem linha da planilha (`security.md` §6). */
    payload: jsonb().$type<Readonly<Record<string, unknown>>>().notNull(),
    attempt: bigint({ mode: 'bigint' }).notNull().default(0n),
    claimOwner: text('claim_owner'),
    claimExpiresAt: timestamp('claim_expires_at', withTimezone),
    nextAttemptAt: timestamp('next_attempt_at', withTimezone).notNull().defaultNow(),
    publishedAt: timestamp('published_at', withTimezone),
    createdAt: timestamp('created_at', withTimezone).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', withTimezone).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cargo_preview_outbox_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'cargo_preview_outbox_company_contractor_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.previewId],
      foreignColumns: [cargoPreviews.companyId, cargoPreviews.id],
      name: 'cargo_preview_outbox_company_preview_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cargo_preview_outbox_company_event_id_unique').on(table.companyId, table.eventId),
    index('cargo_preview_outbox_due_idx')
      .on(table.nextAttemptAt, table.createdAt)
      .where(sql`${table.publishedAt} is null`),
    index('cargo_preview_outbox_pending_contractor_idx')
      .on(table.companyId, table.contractorId, table.eventType)
      .where(sql`${table.publishedAt} is null`),
    check(
      'cargo_preview_outbox_event_type_check',
      sql`${table.eventType} in (${raw(inList(CARGO_PREVIEW_OUTBOX_EVENTS))})`,
    ),
    check(
      'cargo_preview_outbox_preview_scope_check',
      sql`(${table.eventType} = ${raw(`'${CARGO_PREVIEW_OUTBOX_EVENT.process}'`)}) = (${table.previewId} is not null)`,
    ),
    check('cargo_preview_outbox_attempt_check', sql`${table.attempt} >= 0`),
    check('cargo_preview_outbox_event_version_check', sql`${table.eventVersion} > 0`),
    check(
      'cargo_preview_outbox_claim_check',
      sql`(${table.claimOwner} is null) = (${table.claimExpiresAt} is null)`,
    ),
    check('cargo_preview_outbox_payload_check', sql`jsonb_typeof(${table.payload}) = 'object'`),
  ],
)
