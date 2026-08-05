/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { fleetDrivers, fleetVehicles } from './fleet.schema.js'
import { freightCalculations } from './freight.schema.js'
import { nfeDocuments } from './nfe.schema.js'
import { inList } from './schema-check.constant.js'

/** ADR-0023 §4: a viagem não fala com a SEFAZ, então o ciclo é só aberto/fechado. */
export const TRIP_STATUSES = ['open', 'closed'] as const
export type TripStatus = (typeof TRIP_STATUSES)[number]

const TAX_ID_PATTERN = '^[0-9]{11}$'

/** Condutores por viagem: mesmo teto do manifesto (ADR-0016 §1, `MAX_DRIVERS_PER_MANIFEST`). */
const MAX_DRIVERS_PER_TRIP = 10

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)

export const trips = pgTable(
  'trips',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    status: text().$type<TripStatus>().notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trips_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.vehicleId],
      foreignColumns: [fleetVehicles.companyId, fleetVehicles.id],
      name: 'trips_company_vehicle_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trips_company_id_id_unique').on(table.companyId, table.id),
    index('trips_company_status_created_at_idx').on(table.companyId, table.status, table.createdAt),
    index('trips_company_vehicle_idx').on(table.companyId, table.vehicleId),
    check('trips_status_check', sql`${table.status} in (${raw(inList(TRIP_STATUSES))})`),
  ],
)

/** Mesmo desenho de `mdfe_manifest_drivers` (ADR-0023 §1): `driver_id` + posição, mínimo 1. */
export const tripDrivers = pgTable(
  'trip_drivers',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    driverName: text('driver_name').notNull(),
    driverTaxId: text('driver_tax_id').notNull(),
    position: bigint({ mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_drivers_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_drivers_company_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_drivers_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trip_drivers_company_id_id_unique').on(table.companyId, table.id),
    unique('trip_drivers_company_trip_driver_unique').on(
      table.companyId,
      table.tripId,
      table.driverId,
    ),
    unique('trip_drivers_company_trip_position_unique').on(
      table.companyId,
      table.tripId,
      table.position,
    ),
    check(
      'trip_drivers_position_check',
      sql`${table.position} between 1 and ${raw(String(MAX_DRIVERS_PER_TRIP))}`,
    ),
    check('trip_drivers_tax_id_check', sql`${table.driverTaxId} ~ ${raw(`'${TAX_ID_PATTERN}'`)}`),
    check('trip_drivers_name_check', sql`length(${table.driverName}) > 0`),
  ],
)

/**
 * ADR-0023 §2: a viagem aceita a nota antes de o CT-e existir. `nfe_document_id` xor
 * `freight_calculation_id` — a viagem vincula a nota crua ou o frete já calculado sobre ela,
 * nunca os dois ao mesmo tempo pro mesmo vínculo (spec 027 § Dúvidas).
 */
export const tripDocuments = pgTable(
  'trip_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    nfeDocumentId: uuid('nfe_document_id'),
    freightCalculationId: uuid('freight_calculation_id'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_documents_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_documents_company_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.nfeDocumentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'trip_documents_company_nfe_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.freightCalculationId],
      foreignColumns: [freightCalculations.companyId, freightCalculations.id],
      name: 'trip_documents_company_freight_calculation_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trip_documents_company_id_id_unique').on(table.companyId, table.id),
    index('trip_documents_company_trip_idx').on(table.companyId, table.tripId),
    // Nota/frete só vivo em uma viagem por vez — mesmo padrão de mdfe_manifest_items_live_document_unique
    uniqueIndex('trip_documents_live_nfe_document_unique')
      .on(table.companyId, table.nfeDocumentId)
      .where(sql`${table.releasedAt} is null`),
    uniqueIndex('trip_documents_live_freight_calculation_unique')
      .on(table.companyId, table.freightCalculationId)
      .where(sql`${table.releasedAt} is null`),
    check(
      'trip_documents_entity_xor_check',
      sql`(${table.nfeDocumentId} is null) <> (${table.freightCalculationId} is null)`,
    ),
    // Uma vez entregue, o vínculo trava — a nota nunca mais migra para outra viagem
    check(
      'trip_documents_delivered_locks_release_check',
      sql`${table.deliveredAt} is null or ${table.releasedAt} is null`,
    ),
  ],
)
