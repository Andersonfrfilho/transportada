/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import {
  DEFAULT_ENERGY_ADJUSTMENT_FACTOR,
  ENERGY_DISTRIBUTOR_CODE_MAX_LENGTH,
} from '../shared/energy-tariff.constant.js'
import { companies } from './identity.schema.js'

/**
 * A escolha é da empresa: qual distribuidora atende a garagem e quanto a conta acrescenta sobre a
 * tarifa seca. Uma linha por empresa, e a distribuidora casa com a referência pública pelo código —
 * não por chave estrangeira, porque a referência nasce vazia e só a primeira coleta a preenche.
 */
export const companyEnergySettings = pgTable(
  'company_energy_settings',
  {
    companyId: uuid('company_id')
      .primaryKey()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    distributorCode: varchar('distributor_code', {
      length: ENERGY_DISTRIBUTOR_CODE_MAX_LENGTH,
    }).notNull(),
    adjustmentFactor: numeric('adjustment_factor', { precision: 6, scale: 4 })
      .notNull()
      .default(DEFAULT_ENERGY_ADJUSTMENT_FACTOR),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'company_energy_settings_distributor_code_check',
      sql`length(${table.distributorCode}) > 0 and ${table.distributorCode} = upper(${table.distributorCode})`,
    ),
    check('company_energy_settings_adjustment_factor_check', sql`${table.adjustmentFactor} > 0`),
  ],
)
