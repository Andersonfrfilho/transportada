/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** das tabelas de região que a roteirização lê. Migrations rodam só na API;
 * aqui é leitura. Mudou coluna lá? confira aqui — o padrão é o mesmo dos outros quatorze schemas
 * copiados deste worker.
 *
 * Só as colunas que a cobertura usa: o resto (preço, versão, status de importação) é da API.
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const freightRegions = pgTable('freight_regions', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  /** A forma impressa na coluna NUM ROTA: família, ponto, três dígitos. */
  code: text().notNull(),
  status: text().notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const freightRegionCities = pgTable('freight_region_cities', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  regionId: uuid('region_id').notNull(),
  city: text().notNull(),
  state: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const fleetDriverRegions = pgTable('fleet_driver_regions', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  driverId: uuid('driver_id').notNull(),
  regionId: uuid('region_id').notNull(),
  /** `region` cobre a zona inteira; `city` é a cidade solta, e vale por si. */
  scope: text().notNull(),
  city: text().notNull().default(''),
  state: text().notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
