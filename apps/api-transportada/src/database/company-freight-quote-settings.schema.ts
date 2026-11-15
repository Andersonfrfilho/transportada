/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { boolean, check, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

/**
 * Parâmetros do orçamento de frete pelo custo da viagem. Uma linha por empresa; a ausência da linha
 * é resposta válida e vale `FREIGHT_QUOTE_DEFAULTS`. `fuel_km_per_liter` nulo = consumo de referência
 * pelo número de eixos.
 *
 * ⚠️ `updated_by_user_id` sem chave estrangeira de propósito (rastro de quem mexeu no preço), como
 * em `company_driver_allowance_settings`.
 */
export const companyFreightQuoteSettings = pgTable(
  'company_freight_quote_settings',
  {
    companyId: uuid('company_id')
      .primaryKey()
      .references(() => companies.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    marginPercent: numeric('margin_percent', { precision: 9, scale: 4 }).notNull(),
    expectedOccupancyPercent: numeric('expected_occupancy_percent', {
      precision: 9,
      scale: 4,
    }).notNull(),
    driverCostPerKm: numeric('driver_cost_per_km', { precision: 19, scale: 4 }).notNull(),
    maintenanceCostPerKm: numeric('maintenance_cost_per_km', { precision: 19, scale: 4 }).notNull(),
    tiresCostPerKm: numeric('tires_cost_per_km', { precision: 19, scale: 4 }).notNull(),
    fixedCostPerKm: numeric('fixed_cost_per_km', { precision: 19, scale: 4 }).notNull(),
    adValoremPercent: numeric('ad_valorem_percent', { precision: 9, scale: 4 }).notNull(),
    grisPercent: numeric('gris_percent', { precision: 9, scale: 4 }).notNull(),
    fuelKmPerLiter: numeric('fuel_km_per_liter', { precision: 9, scale: 4 }),
    applyAnttFloor: boolean('apply_antt_floor').notNull(),
    updatedByUserId: uuid('updated_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'company_freight_quote_settings_margin_check',
      sql`${table.marginPercent} >= 0 and ${table.marginPercent} < 100`,
    ),
    check(
      'company_freight_quote_settings_occupancy_check',
      sql`${table.expectedOccupancyPercent} > 0 and ${table.expectedOccupancyPercent} <= 100`,
    ),
    check(
      'company_freight_quote_settings_costs_check',
      sql`${table.driverCostPerKm} >= 0 and ${table.maintenanceCostPerKm} >= 0 and ${table.tiresCostPerKm} >= 0 and ${table.fixedCostPerKm} >= 0`,
    ),
    check(
      'company_freight_quote_settings_rates_check',
      sql`${table.adValoremPercent} >= 0 and ${table.adValoremPercent} <= 100 and ${table.grisPercent} >= 0 and ${table.grisPercent} <= 100`,
    ),
    check(
      'company_freight_quote_settings_consumption_check',
      sql`${table.fuelKmPerLiter} is null or ${table.fuelKmPerLiter} > 0`,
    ),
  ],
)
