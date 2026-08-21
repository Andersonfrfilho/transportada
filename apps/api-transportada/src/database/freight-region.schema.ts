/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  FREIGHT_VEHICLE_CLASS_MAX_LENGTH,
  FREIGHT_VEHICLE_CLASSES,
  type FreightVehicleClass,
} from '../shared/freight-class.constant.js'
import { fleetDrivers } from './fleet.schema.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

const moneyColumn = (name: string) => numeric(name, { precision: 19, scale: 4 })

/** A forma impressa na coluna NUM ROTA da tabela de frete: família, ponto, três dígitos. */
const REGION_CODE_CHECK_PATTERN = '^[0-9]\\.00[0-3]$'
const STATE_CHECK_PATTERN = '^[A-Z]{2}$'

export const FREIGHT_REGION_STATUSES = ['active', 'inactive'] as const
export type FreightRegionStatus = (typeof FREIGHT_REGION_STATUSES)[number]

/** `region` cobre a zona e todas abaixo dela; `city` cobre uma cidade só. */
export const FLEET_DRIVER_REGION_SCOPES = ['region', 'city'] as const
export type FleetDriverRegionScope = (typeof FLEET_DRIVER_REGION_SCOPES)[number]

/**
 * Rota + zona da tabela de frete da empresa. É cadastro, nunca constante do produto: o TransportAdA
 * é genérico, e a tabela de uma transportadora não vale para a próxima.
 *
 * A zona é acumulativa por família (a zona 3 atende as zonas 1, 2 e 3), e essa regra vive em
 * `freight-regions/domain/region-coverage.policy.ts` — aqui guarda-se só a zona própria.
 */
export const freightRegions = pgTable(
  'freight_regions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    code: text().notNull(),
    name: text().notNull(),
    zone: integer().notNull(),
    status: text().$type<FreightRegionStatus>().notNull().default('active'),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'freight_regions_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('freight_regions_company_id_id_unique').on(table.companyId, table.id),
    // Chave natural da importação: reimportar a mesma tabela atualiza, nunca duplica
    unique('freight_regions_company_id_code_unique').on(table.companyId, table.code),
    index('freight_regions_company_status_code_idx').on(table.companyId, table.status, table.code),
    check(
      'freight_regions_code_check',
      sql`${table.code} ~ ${sql.raw(`'${REGION_CODE_CHECK_PATTERN}'`)}`,
    ),
    check('freight_regions_name_check', sql`length(${table.name}) > 0`),
    // Zona 0 é a matriz — saída, não zona
    check('freight_regions_zone_check', sql`${table.zone} between 0 and 4`),
    check(
      'freight_regions_status_check',
      sql`${table.status} in (${sql.raw(inList(FREIGHT_REGION_STATUSES))})`,
    ),
    check('freight_regions_version_check', sql`${table.version} > 0`),
  ],
)

/**
 * ⚠️ A unicidade é `(company_id, region_id, city, state)` e **não** `(company_id, city)`:
 * BARRINHA/SP está em `1.000 Barretos Zona 1` e em `5.000 Jaboticabal Zona 1` na tabela real do
 * cliente, com preços diferentes. Uma cidade por empresa recusaria a importação da primeira linha.
 */
export const freightRegionCities = pgTable(
  'freight_region_cities',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    regionId: uuid('region_id').notNull(),
    city: text().notNull(),
    state: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'freight_region_cities_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.regionId, table.companyId],
      foreignColumns: [freightRegions.id, freightRegions.companyId],
      name: 'freight_region_cities_company_region_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('freight_region_cities_region_city_unique').on(
      table.companyId,
      table.regionId,
      table.city,
      table.state,
    ),
    index('freight_region_cities_company_city_idx').on(table.companyId, table.city, table.state),
    check('freight_region_cities_city_check', sql`length(${table.city}) > 0`),
    check(
      'freight_region_cities_state_check',
      sql`${table.state} ~ ${sql.raw(`'${STATE_CHECK_PATTERN}'`)}`,
    ),
  ],
)

/**
 * O que a transportadora **paga** ao motorista/agregado por viagem na região, por classe de veículo.
 * Custo, não receita: a cobrança do cliente continua em `freight_rule_versions`, e o nome da coluna
 * diz de que lado do caixa este número está.
 */
export const freightRegionDriverRates = pgTable(
  'freight_region_driver_rates',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    regionId: uuid('region_id').notNull(),
    freightClass: varchar('freight_class', { length: FREIGHT_VEHICLE_CLASS_MAX_LENGTH })
      .$type<FreightVehicleClass>()
      .notNull(),
    driverAmount: moneyColumn('driver_amount').notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'freight_region_driver_rates_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.regionId, table.companyId],
      foreignColumns: [freightRegions.id, freightRegions.companyId],
      name: 'freight_region_driver_rates_company_region_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('freight_region_driver_rates_region_class_unique').on(
      table.companyId,
      table.regionId,
      table.freightClass,
    ),
    check(
      'freight_region_driver_rates_class_check',
      sql`${table.freightClass} in (${sql.raw(inList(FREIGHT_VEHICLE_CLASSES))})`,
    ),
    // 0 é "não atende": a coluna UTILITÁRIO da tabela do cliente é zero em toda rota fora da matriz
    check('freight_region_driver_rates_amount_check', sql`${table.driverAmount} >= 0`),
  ],
)

/**
 * Onde o motorista roda. Ele soma zonas inteiras e cidades soltas na mesma lista — `scope: 'region'`
 * cobre a zona e as abaixo dela, `scope: 'city'` cobre uma cidade só. Duas tabelas separadas dariam
 * duas listagens para uma pergunta só.
 */
export const fleetDriverRegions = pgTable(
  'fleet_driver_regions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    regionId: uuid('region_id').notNull(),
    scope: text().$type<FleetDriverRegionScope>().notNull(),
    city: text().notNull().default(''),
    state: text().notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'fleet_driver_regions_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.driverId, table.companyId],
      foreignColumns: [fleetDrivers.id, fleetDrivers.companyId],
      name: 'fleet_driver_regions_company_driver_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.regionId, table.companyId],
      foreignColumns: [freightRegions.id, freightRegions.companyId],
      name: 'fleet_driver_regions_company_region_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('fleet_driver_regions_driver_entry_unique').on(
      table.companyId,
      table.driverId,
      table.regionId,
      table.scope,
      table.city,
    ),
    index('fleet_driver_regions_company_driver_idx').on(table.companyId, table.driverId),
    check(
      'fleet_driver_regions_scope_check',
      sql`${table.scope} in (${sql.raw(inList(FLEET_DRIVER_REGION_SCOPES))})`,
    ),
    // Cobertura de cidade sem cidade é linha que não cobre nada; zona com cidade é zona disfarçada
    check(
      'fleet_driver_regions_city_check',
      sql`case when ${table.scope} = 'city' then length(${table.city}) > 0 and ${table.state} ~ ${sql.raw(`'${STATE_CHECK_PATTERN}'`)} else length(${table.city}) = 0 and length(${table.state}) = 0 end`,
    ),
  ],
)
