/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

/**
 * Spec 143 D3: quanto a transportadora paga de diária quando o motorista não tem valor combinado
 * só dele. Uma linha por empresa — a empresa é a chave, porque duas linhas seriam dois valores
 * gerais para a mesma frota —, e a ausência da linha é resposta válida: vale a constante do sistema.
 *
 * ⚠️ `updated_by_user_id` fica sem chave estrangeira de propósito, como em `company_tax_settings`:
 * é rastro de quem mexeu no dinheiro, e apagar o usuário não pode apagar o rastro nem travar a linha.
 */
export const companyDriverAllowanceSettings = pgTable(
  'company_driver_allowance_settings',
  {
    companyId: uuid('company_id')
      .primaryKey()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    dailyAllowanceAmount: numeric('daily_allowance_amount', {
      precision: 19,
      scale: 4,
    }).notNull(),
    updatedByUserId: uuid('updated_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('company_driver_allowance_settings_amount_check', sql`${table.dailyAllowanceAmount} > 0`),
  ],
)
