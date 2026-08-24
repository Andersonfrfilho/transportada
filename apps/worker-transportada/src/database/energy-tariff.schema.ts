/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor da tabela `energy_tariff_references` da API, reduzida ao que a coleta escreve —
 * os CHECKs e a migration vivem lá. Paridade com
 * apps/api-transportada/src/database/energy-tariff.schema.ts. Tarifa homologada é dado público de
 * mercado: sem PII e por isso sem `company_id`.
 */
import { date, numeric, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'

import {
  ANEEL_TARIFF_MODALITY_MAX_LENGTH,
  ANEEL_TARIFF_SUBGROUP_MAX_LENGTH,
  ANEEL_DISTRIBUTOR_CODE_MAX_LENGTH,
} from '../fuel-price-pull/domain/aneel-tariff.constant.js'

export const energyTariffReferences = pgTable(
  'energy_tariff_references',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    distributorCode: varchar('distributor_code', {
      length: ANEEL_DISTRIBUTOR_CODE_MAX_LENGTH,
    }).notNull(),
    distributorTaxId: text('distributor_tax_id').notNull(),
    subgroup: varchar('subgroup', { length: ANEEL_TARIFF_SUBGROUP_MAX_LENGTH }).notNull(),
    modality: varchar('modality', { length: ANEEL_TARIFF_MODALITY_MAX_LENGTH }).notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to').notNull(),
    tusdPerMegawattHour: numeric('tusd_per_megawatt_hour', { precision: 19, scale: 4 }).notNull(),
    tePerMegawattHour: numeric('te_per_megawatt_hour', { precision: 19, scale: 4 }).notNull(),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('energy_tariff_references_natural_unique').on(
      table.distributorCode,
      table.subgroup,
      table.modality,
      table.effectiveFrom,
    ),
  ],
)
