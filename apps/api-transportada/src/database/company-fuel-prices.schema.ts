/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, numeric, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import {
  FUEL_PRODUCT_MAX_LENGTH,
  FUEL_PRODUCTS,
  type FuelProduct,
} from '../shared/fuel.constant.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * Ajuste manual do preço, por combustível. Ausência de linha é ausência de ajuste — só existe linha
 * para o produto que alguém sobrescreveu, e por isso o preço nunca é `null` nem zero.
 */
export const companyFuelPrices = pgTable(
  'company_fuel_prices',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    product: varchar({ length: FUEL_PRODUCT_MAX_LENGTH }).$type<FuelProduct>().notNull(),
    pricePerUnit: numeric('price_per_unit', { precision: 19, scale: 4 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.companyId, table.product],
      name: 'company_fuel_prices_company_id_product_pk',
    }),
    check(
      'company_fuel_prices_product_check',
      sql`${table.product} in (${sql.raw(inList(FUEL_PRODUCTS))})`,
    ),
    check('company_fuel_prices_price_check', sql`${table.pricePerUnit} > 0`),
  ],
)
