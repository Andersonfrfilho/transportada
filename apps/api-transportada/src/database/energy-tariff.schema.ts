/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  ENERGY_DISTRIBUTOR_CODE_MAX_LENGTH,
  ENERGY_DISTRIBUTOR_NAME_MAX_LENGTH,
  ENERGY_TARIFF_MODALITY_MAX_LENGTH,
  ENERGY_TARIFF_SUBGROUP_MAX_LENGTH,
} from '../shared/energy-tariff.constant.js'

/**
 * Tarifa homologada pela ANEEL: dado público por distribuidora, idêntico para toda empresa da
 * instalação, sem PII e por isso **sem `company_id`** — como o preço da ANP. As duas parcelas ficam
 * como publicadas, em R$/MWh, com a unidade no nome da coluna; o preço efetivo é derivado do fator
 * que a empresa declara, e guardá-lo aqui seria uma segunda verdade sobre o mesmo número.
 */
export const energyTariffReferences = pgTable(
  'energy_tariff_references',
  {
    id: uuid().defaultRandom().primaryKey(),
    distributorCode: varchar('distributor_code', {
      length: ENERGY_DISTRIBUTOR_CODE_MAX_LENGTH,
    }).notNull(),
    distributorName: varchar('distributor_name', {
      length: ENERGY_DISTRIBUTOR_NAME_MAX_LENGTH,
    }).notNull(),
    subgroup: varchar({ length: ENERGY_TARIFF_SUBGROUP_MAX_LENGTH }).notNull(),
    modality: varchar({ length: ENERGY_TARIFF_MODALITY_MAX_LENGTH }).notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to').notNull(),
    tusdPerMegawattHour: numeric('tusd_per_megawatt_hour', { precision: 19, scale: 4 }).notNull(),
    tePerMegawattHour: numeric('te_per_megawatt_hour', { precision: 19, scale: 4 }).notNull(),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // O recorte entra na chave: coleta de outro subgrupo não pode sobrescrever a tarifa em uso
    unique('energy_tariff_references_natural_unique').on(
      table.distributorCode,
      table.subgroup,
      table.modality,
      table.effectiveFrom,
    ),
    check(
      'energy_tariff_references_distributor_check',
      sql`length(${table.distributorCode}) > 0 and ${table.distributorCode} = upper(${table.distributorCode}) and length(${table.distributorName}) > 0`,
    ),
    check(
      'energy_tariff_references_scope_check',
      sql`length(${table.subgroup}) > 0 and length(${table.modality}) > 0`,
    ),
    check(
      'energy_tariff_references_period_check',
      sql`${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    // Parcela zerada existe; par zerado não é tarifa nenhuma
    check(
      'energy_tariff_references_parcel_check',
      sql`${table.tusdPerMegawattHour} >= 0 and ${table.tePerMegawattHour} >= 0 and ${table.tusdPerMegawattHour} + ${table.tePerMegawattHour} > 0`,
    ),
  ],
)
