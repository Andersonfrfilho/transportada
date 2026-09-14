/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `trip-cargo-layout-outbox.schema.ts` da API. O worker é quem **lê e
 * publica** esta fila (spec 145 D8), por isso a cópia carrega todas as colunas — mas nenhuma
 * constraint: quem faz migration é a API, e os CHECKs e FKs de tenant são dela.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/** Cópia de tipo de `CARGO_LAYOUT_OUTBOX_EVENT_TYPES` da API; quem valida é o CHECK da tabela. */
export type CargoLayoutOutboxEventType = 'transportada.trip.cargo-layout.requested'

export const tripCargoLayoutOutbox = pgTable('trip_cargo_layout_outbox', {
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
})
