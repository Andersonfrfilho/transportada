/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  CARGO_ARRIVAL_DOCUMENT_STATE,
  CARGO_ARRIVAL_DOCUMENT_STATES,
  type CargoArrivalDocumentState,
} from '../shared/cargo-arrival.constant.js'
import { cargoArrivals } from './cargo-arrival.schema.js'
import { companies } from './identity.schema.js'
import { nfeDocuments } from './nfe.schema.js'
import { inList } from './schema-check.constant.js'

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)
const withTimezone = { withTimezone: true } as const

const { expected, received, separated } = CARGO_ARRIVAL_DOCUMENT_STATE

/**
 * A nota na chegada, com o eixo próprio do recebimento (nunca `trip_documents.separation_status`).
 * `unique (company_id, nfe_document_id)`: uma nota entra em no máximo uma chegada (ADR-0094 §6).
 */
export const cargoArrivalDocuments = pgTable(
  'cargo_arrival_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    arrivalId: uuid('arrival_id').notNull(),
    nfeDocumentId: uuid('nfe_document_id').notNull(),
    routeName: text('route_name'),
    cityIbgeCode: text('city_ibge_code'),
    separationState: varchar('separation_state', { length: 16 })
      .$type<CargoArrivalDocumentState>()
      .notNull()
      .default(expected),
    receivedAt: timestamp('received_at', withTimezone),
    separatedAt: timestamp('separated_at', withTimezone),
    createdAt: timestamp('created_at', withTimezone).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', withTimezone).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cargo_arrival_documents_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.arrivalId],
      foreignColumns: [cargoArrivals.companyId, cargoArrivals.id],
      name: 'cargo_arrival_documents_company_arrival_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.nfeDocumentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'cargo_arrival_documents_company_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cargo_arrival_documents_company_arrival_id_unique').on(
      table.companyId,
      table.arrivalId,
      table.id,
    ),
    unique('cargo_arrival_documents_company_document_unique').on(
      table.companyId,
      table.nfeDocumentId,
    ),
    check(
      'cargo_arrival_documents_route_name_check',
      sql`char_length(${table.routeName}) between 1 and 40`,
    ),
    check(
      'cargo_arrival_documents_city_ibge_code_check',
      sql`${table.cityIbgeCode} ~ '^[0-9]{7}$'`,
    ),
    check(
      'cargo_arrival_documents_separation_state_check',
      sql`${table.separationState} in (${raw(inList(CARGO_ARRIVAL_DOCUMENT_STATES))})`,
    ),
    /** `is not null` explícito: `separated_at >= received_at` com NULL vira NULL, e NULL passa. */
    check(
      'cargo_arrival_documents_state_dates_check',
      sql`(${table.separationState} = ${raw(`'${expected}'`)} and ${table.receivedAt} is null and ${table.separatedAt} is null) or (${table.separationState} = ${raw(`'${received}'`)} and ${table.receivedAt} is not null and ${table.separatedAt} is null) or (${table.separationState} = ${raw(`'${separated}'`)} and ${table.receivedAt} is not null and ${table.separatedAt} is not null and ${table.separatedAt} >= ${table.receivedAt})`,
    ),
  ],
)
