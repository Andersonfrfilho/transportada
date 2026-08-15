/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor da tabela `fuel_price_references` da API, reduzida ao que a coleta escreve — os
 * CHECKs e a migration vivem lá. Paridade com
 * apps/api-transportada/src/database/fuel-reference.schema.ts. Dado público de mercado: sem PII e
 * por isso sem `company_id`.
 */
import {
  char,
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
  type FuelProduct,
} from '../fuel-price-pull/domain/fuel.constant.js'

export const fuelPriceReferences = pgTable(
  'fuel_price_references',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    product: varchar('product', { length: FUEL_PRODUCT_MAX_LENGTH }).$type<FuelProduct>().notNull(),
    state: char('state', { length: 2 }).notNull(),
    weekEndingOn: date('week_ending_on').notNull(),
    pricePerUnit: numeric('price_per_unit', { precision: 19, scale: 4 }).notNull(),
    stationCount: integer('station_count').notNull(),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('fuel_price_references_natural_unique').on(
      table.product,
      table.state,
      table.weekEndingOn,
    ),
  ],
)
