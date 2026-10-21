/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108, D10/D12): o bloco "E-mail à contratante" do tipo de ocorrência. Duas tabelas de ligação no
 * molde de `company_occurrence_type_contractors`: o tipo é alcançado por `(company_id, id)` e apagado junto
 * (`cascade`). Em cópia: só entra responsável da lista da empresa (267), e quem sai dela sai do tipo. Destinatários:
 * contato de contratante; contato não se apaga hoje, e se um dia se apagar, sai da escolha.
 */
import { foreignKey, index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companyOccurrenceWatchers, contractorContacts } from './contractor-mail.schema.js'
import { companyOccurrenceTypes } from './trip.schema.js'

export const companyOccurrenceTypeWatchers = pgTable(
  'company_occurrence_type_watchers',
  {
    companyId: uuid('company_id').notNull(),
    occurrenceTypeId: uuid('occurrence_type_id').notNull(),
    userId: uuid('user_id').notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.companyId, table.occurrenceTypeId, table.userId],
      name: 'company_occurrence_type_watchers_pk',
    }),
    foreignKey({
      columns: [table.companyId, table.occurrenceTypeId],
      foreignColumns: [companyOccurrenceTypes.companyId, companyOccurrenceTypes.id],
      name: 'company_occurrence_type_watchers_type_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.userId],
      foreignColumns: [companyOccurrenceWatchers.companyId, companyOccurrenceWatchers.userId],
      name: 'company_occurrence_type_watchers_company_watcher_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('company_occurrence_type_watchers_user_idx').on(table.companyId, table.userId),
  ],
)

export const companyOccurrenceTypeRecipients = pgTable(
  'company_occurrence_type_recipients',
  {
    companyId: uuid('company_id').notNull(),
    occurrenceTypeId: uuid('occurrence_type_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.companyId, table.occurrenceTypeId, table.contactId],
      name: 'company_occurrence_type_recipients_pk',
    }),
    foreignKey({
      columns: [table.companyId, table.occurrenceTypeId],
      foreignColumns: [companyOccurrenceTypes.companyId, companyOccurrenceTypes.id],
      name: 'company_occurrence_type_recipients_type_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contactId],
      foreignColumns: [contractorContacts.companyId, contractorContacts.id],
      name: 'company_occurrence_type_recipients_contact_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('company_occurrence_type_recipients_contact_idx').on(table.companyId, table.contactId),
  ],
)
