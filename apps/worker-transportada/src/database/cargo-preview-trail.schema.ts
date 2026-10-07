/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `cargo_preview_events`, `cargo_preview_outbox`,
 * `contractor_recipient_aliases` e das colunas do perfil de recebimento que o vínculo lê
 * (`api-transportada/src/database/`). Só colunas: CHECK, FK e trigger append-only são da migration.
 */
import {
  bigint,
  boolean,
  char,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import type {
  CargoPreviewChannel,
  CargoPreviewEventKind,
  CargoPreviewOutboxEvent,
} from '../shared/cargo-preview.constant.js'

const withTimezone = { withTimezone: true } as const

export const cargoPreviewEvents = pgTable('cargo_preview_events', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  previewId: uuid('preview_id').notNull(),
  itemId: uuid('item_id'),
  kind: varchar('kind', { length: 32 }).$type<CargoPreviewEventKind>().notNull(),
  actorUserId: uuid('actor_user_id'),
  channel: varchar('channel', { length: 16 }).$type<CargoPreviewChannel>().notNull(),
  occurredAt: timestamp('occurred_at', withTimezone).notNull(),
  details: jsonb().$type<Readonly<Record<string, unknown>>>(),
})

export const cargoPreviewOutbox = pgTable('cargo_preview_outbox', {
  id: uuid().defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  contractorId: uuid('contractor_id').notNull(),
  previewId: uuid('preview_id'),
  eventType: varchar('event_type', { length: 40 }).$type<CargoPreviewOutboxEvent>().notNull(),
  eventVersion: bigint('event_version', { mode: 'bigint' }).notNull().default(1n),
  correlationId: text('correlation_id').notNull(),
  payload: jsonb().notNull(),
  attempt: bigint({ mode: 'bigint' }).notNull().default(0n),
  claimOwner: text('claim_owner'),
  claimExpiresAt: timestamp('claim_expires_at', withTimezone),
  nextAttemptAt: timestamp('next_attempt_at', withTimezone).notNull().defaultNow(),
  publishedAt: timestamp('published_at', withTimezone),
  createdAt: timestamp('created_at', withTimezone).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', withTimezone).notNull().defaultNow(),
})

export const contractorRecipientAliases = pgTable('contractor_recipient_aliases', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  contractorId: uuid('contractor_id').notNull(),
  recipientCode: text('recipient_code').notNull(),
  recipientTaxId: text('recipient_tax_id').notNull(),
  learnedFromPreviewId: uuid('learned_from_preview_id').notNull(),
})

/** Só o que a leitura e o vínculo usam; o perfil é escrito pela API. */
export const contractorReceivingProfiles = pgTable('contractor_receiving_profiles', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  contractorId: uuid('contractor_id').notNull(),
  isEnabled: boolean('is_enabled').notNull(),
  matchWindowDays: smallint('match_window_days').notNull(),
  weightTolerancePercent: numeric('weight_tolerance_percent', { precision: 5, scale: 2 }).notNull(),
  previewEnabled: boolean('preview_enabled').notNull(),
  previewSheetName: text('preview_sheet_name'),
  previewColumnMap: jsonb('preview_column_map'),
  arrivalReferenceLabel: text('arrival_reference_label'),
  previewInboundTokenHash: char('preview_inbound_token_hash', { length: 64 }),
  previewForwarderAllowlist: text('preview_forwarder_allowlist').array(),
  previewSenderAllowlist: text('preview_sender_allowlist').array(),
})
