/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import type { FiscalEnvironment } from './company-fiscal-profile.schema.js'
import { companies } from './identity.schema.js'

export const FISCAL_MODELS = ['cte', 'mdfe'] as const
export type FiscalModel = (typeof FISCAL_MODELS)[number]

export const fiscalSequences = pgTable(
  'fiscal_sequences',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    environment: text().$type<FiscalEnvironment>().notNull(),
    model: text().$type<FiscalModel>().notNull().default('cte'),
    series: bigint({ mode: 'bigint' }).notNull(),
    nextNumber: bigint('next_number', { mode: 'bigint' }).notNull(),
    lastReservedNumber: bigint('last_reserved_number', { mode: 'bigint' }),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('fiscal_sequences_company_id_environment_model_series_unique').on(
      table.companyId,
      table.environment,
      table.model,
      table.series,
    ),
    unique('fiscal_sequences_company_id_id_unique').on(table.companyId, table.id),
    check(
      'fiscal_sequences_environment_check',
      sql`${table.environment} in ('homologation', 'production')`,
    ),
    check('fiscal_sequences_model_check', sql`${table.model} in ('cte', 'mdfe')`),
    check('fiscal_sequences_series_check', sql`${table.series} > 0`),
    check(
      'fiscal_sequences_number_coherence_check',
      sql`${table.nextNumber} > 0 and (${table.lastReservedNumber} is null or (${table.lastReservedNumber} > 0 and ${table.nextNumber} = ${table.lastReservedNumber} + 1))`,
    ),
    check('fiscal_sequences_version_check', sql`${table.version} > 0`),
  ],
)

export const fiscalSequenceReservations = pgTable(
  'fiscal_sequence_reservations',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    fiscalSequenceId: uuid('fiscal_sequence_id').notNull(),
    reservationKey: text('reservation_key').notNull(),
    number: bigint({ mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.fiscalSequenceId],
      foreignColumns: [fiscalSequences.companyId, fiscalSequences.id],
      name: 'fiscal_sequence_reservations_company_sequence_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('fiscal_sequence_reservations_company_id_reservation_key_unique').on(
      table.companyId,
      table.reservationKey,
    ),
    unique('fiscal_sequence_reservations_company_id_id_unique').on(table.companyId, table.id),
    unique('fiscal_sequence_reservations_sequence_id_number_unique').on(
      table.fiscalSequenceId,
      table.number,
    ),
    index('fiscal_sequence_reservations_company_id_sequence_id_idx').on(
      table.companyId,
      table.fiscalSequenceId,
    ),
    check('fiscal_sequence_reservations_number_check', sql`${table.number} > 0`),
  ],
)
