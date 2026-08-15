/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  char,
  check,
  date,
  integer,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  FUEL_PRODUCT_MAX_LENGTH,
  FUEL_PRODUCTS,
  type FuelProduct,
} from '../shared/fuel.constant.js'
import { inList } from './schema-check.constant.js'

const STATE_PATTERN = '^[A-Z]{2}$'

/**
 * Preço publicado pela ANP: dado público de mercado, idêntico para toda empresa da instalação, sem
 * PII e por isso **sem `company_id`**. `price_per_unit` é R$/litro, ou R$/m³ quando o produto é GNV.
 */
export const fuelPriceReferences = pgTable(
  'fuel_price_references',
  {
    id: uuid().defaultRandom().primaryKey(),
    product: varchar({ length: FUEL_PRODUCT_MAX_LENGTH }).$type<FuelProduct>().notNull(),
    state: char({ length: 2 }).notNull(),
    weekEndingOn: date('week_ending_on').notNull(),
    pricePerUnit: numeric('price_per_unit', { precision: 19, scale: 4 }).notNull(),
    stationCount: integer('station_count').notNull(),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A chave natural é a idempotência do ciclo: reexecutar a mesma semana não duplica linha
    unique('fuel_price_references_natural_unique').on(
      table.product,
      table.state,
      table.weekEndingOn,
    ),
    check(
      'fuel_price_references_product_check',
      sql`${table.product} in (${sql.raw(inList(FUEL_PRODUCTS))})`,
    ),
    check('fuel_price_references_price_check', sql`${table.pricePerUnit} > 0`),
    check('fuel_price_references_station_count_check', sql`${table.stationCount} >= 0`),
    check(
      'fuel_price_references_state_check',
      sql`${table.state} ~ ${sql.raw(`'${STATE_PATTERN}'`)}`,
    ),
  ],
)
