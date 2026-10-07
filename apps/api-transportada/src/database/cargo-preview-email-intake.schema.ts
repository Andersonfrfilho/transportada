/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  CARGO_PREVIEW_EMAIL_DKIM_RESULTS,
  CARGO_PREVIEW_EMAIL_OUTCOMES,
  CARGO_PREVIEW_EMAIL_REJECTION_CODES,
  CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATIONS,
  type CargoPreviewEmailDkimResult,
  type CargoPreviewEmailOutcome,
  type CargoPreviewEmailRejectionCode,
} from '../shared/cargo-preview.constant.js'
import { cargoPreviews } from './cargo-preview.schema.js'
import { contractors } from './delivery-client.schema.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import { storedObjects } from './storage.schema.js'

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)
const withTimezone = { withTimezone: true } as const

/**
 * Spec 237 T4.6 (ADR-0094 §10): uma linha por e-mail encaminhado que casou o token de um perfil — o
 * que virou prévia e o que foi recusado, com o motivo. É a idempotência por mensagem
 * (`provider_email_id`) e o único lugar onde a recusa aparece. Append-only pelo trigger da migration.
 * Nunca guarda endereço, nome, assunto, corpo ou cabeçalho: só ids, códigos e o resultado do DKIM.
 */
export const cargoPreviewEmailIntakes = pgTable(
  'cargo_preview_email_intakes',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    providerEmailId: text('provider_email_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    outcome: varchar('outcome', { length: 16 }).$type<CargoPreviewEmailOutcome>().notNull(),
    reasonCode: varchar('reason_code', { length: 40 }).$type<CargoPreviewEmailRejectionCode>(),
    previewId: uuid('preview_id'),
    /** Verdadeiro quando o arquivo já era uma prévia do contratante: nada novo nasceu. */
    isReplay: boolean('is_replay').notNull().default(false),
    forwarderDkimResult: varchar('forwarder_dkim_result', {
      length: 16,
    }).$type<CargoPreviewEmailDkimResult>(),
    /** Preenchido só quando o remetente original foi lido do cabeçalho; sempre `unverified`. */
    originalSenderVerification: varchar('original_sender_verification', { length: 16 }),
    rawObjectId: uuid('raw_object_id'),
    receivedAt: timestamp('received_at', withTimezone).notNull(),
    recordedAt: timestamp('recorded_at', withTimezone).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cargo_preview_email_intakes_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'cargo_preview_email_intakes_company_contractor_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.previewId],
      foreignColumns: [cargoPreviews.companyId, cargoPreviews.id],
      name: 'cargo_preview_email_intakes_company_preview_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.rawObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'cargo_preview_email_intakes_company_raw_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cargo_preview_email_intakes_company_provider_email_unique').on(
      table.companyId,
      table.providerEmailId,
    ),
    index('cargo_preview_email_intakes_company_contractor_received_idx').on(
      table.companyId,
      table.contractorId,
      table.receivedAt.desc(),
    ),
    check(
      'cargo_preview_email_intakes_provider_email_id_check',
      sql`char_length(${table.providerEmailId}) between 1 and 256`,
    ),
    check(
      'cargo_preview_email_intakes_outcome_check',
      sql`${table.outcome} in (${raw(inList(CARGO_PREVIEW_EMAIL_OUTCOMES))})`,
    ),
    check(
      'cargo_preview_email_intakes_reason_code_check',
      sql`${table.reasonCode} in (${raw(inList(CARGO_PREVIEW_EMAIL_REJECTION_CODES))})`,
    ),
    /** Recusou ⇔ tem motivo; aceitou ⇔ tem prévia, e `is_replay` só vale para quem aceitou. */
    check(
      'cargo_preview_email_intakes_shape_check',
      sql`(${table.outcome} = 'rejected') = (${table.reasonCode} is not null) and (${table.outcome} = 'accepted') = (${table.previewId} is not null) and (${table.outcome} = 'accepted' or not ${table.isReplay})`,
    ),
    check(
      'cargo_preview_email_intakes_dkim_result_check',
      sql`${table.forwarderDkimResult} in (${raw(inList(CARGO_PREVIEW_EMAIL_DKIM_RESULTS))})`,
    ),
    check(
      'cargo_preview_email_intakes_original_sender_check',
      sql`${table.originalSenderVerification} in (${raw(inList(CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATIONS))})`,
    ),
  ],
)
