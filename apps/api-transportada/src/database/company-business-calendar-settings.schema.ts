/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { boolean, foreignKey, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

/**
 * Spec 238 RF5: se o sábado conta como dia útil para a empresa. Uma linha por empresa, e a ausência
 * da linha é resposta válida: `false` — segunda a sexta, a premissa da spec.
 *
 * ⚠️ `updated_by_user_id` fica sem chave estrangeira de propósito, como na retenção da posição: é
 * rastro de quem decidiu, e apagar o usuário não pode apagar o rastro nem travar a linha.
 */
export const companyBusinessCalendarSettings = pgTable(
  'company_business_calendar_settings',
  {
    companyId: uuid('company_id').primaryKey(),
    saturdayIsBusinessDay: boolean('saturday_is_business_day').notNull().default(false),
    updatedByUserId: uuid('updated_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Nome explícito: o gerado passaria de 63 caracteres e o drizzle o trocaria por um hash. */
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_business_calendar_settings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)
