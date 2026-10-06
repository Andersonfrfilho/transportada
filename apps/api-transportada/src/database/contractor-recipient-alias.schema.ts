/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, foreignKey, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { cargoPreviews } from './cargo-preview.schema.js'
import { contractors } from './delivery-client.schema.js'
import { companies } from './identity.schema.js'

const withTimezone = { withTimezone: true } as const

/**
 * Spec 237 RF5a item 7: o código do destinatário no contratante (`Company`) ↔ o CNPJ/CPF dele, aprendido
 * só de linha `matched` (nunca de sugestão). Medido 1:1 (212 códigos, 0 conflitos): o par gravado
 * nunca é sobrescrito — conflito novo mantém o existente e vira aviso no log.
 */
export const contractorRecipientAliases = pgTable(
  'contractor_recipient_aliases',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    recipientCode: text('recipient_code').notNull(),
    recipientTaxId: text('recipient_tax_id').notNull(),
    learnedFromPreviewId: uuid('learned_from_preview_id').notNull(),
    createdAt: timestamp('created_at', withTimezone).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_recipient_aliases_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'contractor_recipient_aliases_company_contractor_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.learnedFromPreviewId],
      foreignColumns: [cargoPreviews.companyId, cargoPreviews.id],
      name: 'contractor_recipient_aliases_company_preview_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('contractor_recipient_aliases_contractor_code_unique').on(
      table.companyId,
      table.contractorId,
      table.recipientCode,
    ),
    check(
      'contractor_recipient_aliases_recipient_code_check',
      sql`char_length(${table.recipientCode}) between 1 and 40`,
    ),
    check(
      'contractor_recipient_aliases_recipient_tax_id_check',
      sql`${table.recipientTaxId} ~ '^([0-9]{11}|[A-Z0-9]{12}[0-9]{2})$'`,
    ),
  ],
)
