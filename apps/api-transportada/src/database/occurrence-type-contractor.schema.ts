/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 (ADR-0107): a lista de contratantes de um tipo de ocorrência `listed`. Tabela de
 * ligação no molde de `company_occurrence_type_moments`: `company_id` presa à empresa, o tipo
 * alcançado por `(company_id, id)` e apagado junto (`cascade`); a contratante por
 * `(company_id, id)` com `restrict` — contratante não se apaga, só fica `inactive`.
 * Invariante (caso de uso, tipo travado `FOR UPDATE`): `listed` ⇔ ao menos uma linha.
 */
import { foreignKey, index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'

import { contractors } from './delivery-client.schema.js'
import { companyOccurrenceTypes } from './trip.schema.js'

export const companyOccurrenceTypeContractors = pgTable(
  'company_occurrence_type_contractors',
  {
    companyId: uuid('company_id').notNull(),
    occurrenceTypeId: uuid('occurrence_type_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.companyId, table.occurrenceTypeId, table.contractorId],
      name: 'company_occurrence_type_contractors_pk',
    }),
    foreignKey({
      columns: [table.companyId, table.occurrenceTypeId],
      foreignColumns: [companyOccurrenceTypes.companyId, companyOccurrenceTypes.id],
      name: 'company_occurrence_type_contractors_type_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'company_occurrence_type_contractors_contractor_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    index('company_occurrence_type_contractors_contractor_idx').on(
      table.companyId,
      table.contractorId,
    ),
  ],
)
