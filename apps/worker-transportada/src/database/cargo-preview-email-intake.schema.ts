/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `cargo_preview_email_intakes` (`api-transportada/src/database/`). Só colunas:
 * CHECK, FK, unique e o trigger append-only são da migration da API.
 */
import { boolean, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import type {
  CargoPreviewEmailDkimResult,
  CargoPreviewEmailOutcome,
  CargoPreviewEmailRejectionCode,
} from '../shared/cargo-preview.constant.js'

const withTimezone = { withTimezone: true } as const

export const cargoPreviewEmailIntakes = pgTable('cargo_preview_email_intakes', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  providerEmailId: text('provider_email_id').notNull(),
  contractorId: uuid('contractor_id').notNull(),
  outcome: varchar('outcome', { length: 16 }).$type<CargoPreviewEmailOutcome>().notNull(),
  reasonCode: varchar('reason_code', { length: 40 }).$type<CargoPreviewEmailRejectionCode>(),
  previewId: uuid('preview_id'),
  isReplay: boolean('is_replay').notNull().default(false),
  forwarderDkimResult: varchar('forwarder_dkim_result', {
    length: 16,
  }).$type<CargoPreviewEmailDkimResult>(),
  originalSenderVerification: varchar('original_sender_verification', { length: 16 }),
  rawObjectId: uuid('raw_object_id'),
  receivedAt: timestamp('received_at', withTimezone).notNull(),
  /** O relógio do banco: é por ele que a janela de e-mails por contratante anda. */
  recordedAt: timestamp('recorded_at', withTimezone).notNull().defaultNow(),
})
