/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `trip-cargo-layout.schema.ts` da API. O worker é quem **escreve** esta
 * tabela (spec 145 D9: `running` → `ready`/`failed`, com tentativa, duração e carimbo), por isso a
 * cópia carrega todas as colunas — mas nenhuma constraint: quem faz migration é a API, e os CHECKs
 * de status, de planta e de código de erro são dela.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/** Cópia de tipo de `CARGO_LAYOUT_STATUSES` da API; quem valida é o CHECK da tabela. */
export type CargoLayoutStatus = 'queued' | 'running' | 'ready' | 'failed'

export const tripCargoLayouts = pgTable('trip_cargo_layouts', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  tripId: uuid('trip_id'),
  status: text().$type<CargoLayoutStatus>().notNull().default('queued'),
  inputHash: text('input_hash').notNull(),
  policyVersion: text('policy_version').notNull(),
  input: jsonb().notNull(),
  layout: jsonb(),
  errorCode: text('error_code').notNull().default(''),
  attempt: bigint({ mode: 'number' }).notNull().default(0),
  durationMs: bigint('duration_ms', { mode: 'number' }),
  computedAt: timestamp('computed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
