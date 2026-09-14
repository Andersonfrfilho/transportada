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
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { tripCargoLayouts } from './trip-cargo-layout.schema.js'

/**
 * Spec 145 D8: o pedido de plano de carga, gravado na **mesma transação** que o upsert de
 * `trip_cargo_layouts` (ADR-0053) — o mesmo desenho de `aggregate_attachment_outbox`, com
 * `layout_id` no lugar de `attachment_id`.
 */
export const CARGO_LAYOUT_OUTBOX_EVENT_TYPES = ['transportada.trip.cargo-layout.requested'] as const
export type CargoLayoutOutboxEventType = (typeof CARGO_LAYOUT_OUTBOX_EVENT_TYPES)[number]

export const tripCargoLayoutOutbox = pgTable(
  'trip_cargo_layout_outbox',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    layoutId: uuid('layout_id').notNull(),
    eventType: text('event_type').$type<CargoLayoutOutboxEventType>().notNull(),
    eventVersion: bigint('event_version', { mode: 'bigint' }).notNull().default(1n),
    correlationId: text('correlation_id').notNull(),
    payload: jsonb().notNull(),
    attempt: bigint({ mode: 'bigint' }).notNull().default(0n),
    claimOwner: text('claim_owner'),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_cargo_layout_outbox_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.layoutId],
      foreignColumns: [tripCargoLayouts.companyId, tripCargoLayouts.id],
      name: 'trip_cargo_layout_outbox_company_layout_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trip_cargo_layout_outbox_company_id_id_unique').on(table.companyId, table.id),
    unique('trip_cargo_layout_outbox_company_id_event_id_unique').on(
      table.companyId,
      table.eventId,
    ),
    index('trip_cargo_layout_outbox_company_published_next_attempt_created_idx').on(
      table.companyId,
      table.publishedAt,
      table.nextAttemptAt,
      table.createdAt,
    ),
    check(
      'trip_cargo_layout_outbox_event_type_check',
      sql`${table.eventType} in ('transportada.trip.cargo-layout.requested')`,
    ),
  ],
)

export type TripCargoLayoutOutboxRow = typeof tripCargoLayoutOutbox.$inferSelect
