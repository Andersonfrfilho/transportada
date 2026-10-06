/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1b.1 (RF0): os momentos em que um tipo de ocorrência pode ser registrado. Tabela filha,
 * não coluna por momento: o conjunto cresce, e coluna por momento faria de cada momento novo uma
 * migration de schema. `stage` e `flow` continuam gravados no tipo, derivados do conjunto — são a
 * rede do rollback e o que os leitores antigos usam.
 *
 * Padrão de tenant: `company_id` presa à empresa, o tipo alcançado por `(company_id, id)` e apagado
 * junto, e cada momento uma vez por tipo dentro da empresa.
 */
import { sql } from 'drizzle-orm'
import { check, foreignKey, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'

import { OCCURRENCE_MOMENTS, type OccurrenceMoment } from '../shared/trip-occurrence.constant.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import { companyOccurrenceTypes } from './trip.schema.js'

export const companyOccurrenceTypeMoments = pgTable(
  'company_occurrence_type_moments',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    occurrenceTypeId: uuid('occurrence_type_id').notNull(),
    moment: varchar({ length: 16 }).$type<OccurrenceMoment>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_occurrence_type_moments_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.occurrenceTypeId],
      foreignColumns: [companyOccurrenceTypes.companyId, companyOccurrenceTypes.id],
      name: 'company_occurrence_type_moments_type_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('company_occurrence_type_moments_unique').on(
      table.companyId,
      table.occurrenceTypeId,
      table.moment,
    ),
    check(
      'company_occurrence_type_moments_moment_check',
      sql`${table.moment} in (${sql.raw(inList(OCCURRENCE_MOMENTS))})`,
    ),
  ],
)
