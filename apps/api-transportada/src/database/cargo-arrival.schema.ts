/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  CARGO_ARRIVAL_CHANNELS,
  CARGO_ARRIVAL_DOCUMENT_STATE,
  CARGO_ARRIVAL_DOCUMENT_STATES,
  CARGO_ARRIVAL_STATUS,
  CARGO_ARRIVAL_STATUSES,
  type CargoArrivalChannel,
  type CargoArrivalDocumentState,
  type CargoArrivalStatus,
} from '../shared/cargo-arrival.constant.js'
import { contractors } from './delivery-client.schema.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { nfeDocuments } from './nfe.schema.js'
import { inList } from './schema-check.constant.js'

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)
const withTimezone = { withTimezone: true } as const

/**
 * Spec 237 Fase 2 (ADR-0094 §6): a carga do contratante na doca, antes de existir viagem. A janela e
 * o prazo são **cópias** do perfil no registro — editar o perfil depois nunca refaz esta linha.
 */
export const cargoArrivals = pgTable(
  'cargo_arrivals',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    arrivedAt: timestamp('arrived_at', withTimezone).notNull(),
    palletCount: integer('pallet_count'),
    separationWindowHours: smallint('separation_window_hours'),
    /** Lido pela spec 236: o prazo de entrega desta chegada, congelado no registro. */
    deliveryDeadlineBusinessDays: smallint('delivery_deadline_business_days'),
    separationDueAt: timestamp('separation_due_at', withTimezone),
    /** Lacre/carga informativo, nunca chave (spec 237 RF5b). */
    reference: text(),
    registeredByUserId: uuid('registered_by_user_id').notNull(),
    channel: varchar('channel', { length: 16 }).$type<CargoArrivalChannel>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    /** sha256 do pedido: a mesma chave com outro conteúdo é reuso, não repetição. */
    requestFingerprint: text('request_fingerprint').notNull(),
    status: varchar('status', { length: 16 })
      .$type<CargoArrivalStatus>()
      .notNull()
      .default(CARGO_ARRIVAL_STATUS.open),
    createdAt: timestamp('created_at', withTimezone).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', withTimezone).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cargo_arrivals_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'cargo_arrivals_company_contractor_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.registeredByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'cargo_arrivals_registered_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cargo_arrivals_company_id_id_unique').on(table.companyId, table.id),
    unique('cargo_arrivals_company_idempotency_key_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    index('cargo_arrivals_company_arrived_idx').on(
      table.companyId,
      table.arrivedAt.desc(),
      table.id.desc(),
    ),
    index('cargo_arrivals_company_contractor_arrived_idx').on(
      table.companyId,
      table.contractorId,
      table.arrivedAt.desc(),
      table.id.desc(),
    ),
    check('cargo_arrivals_pallet_count_check', sql`${table.palletCount} >= 0`),
    check(
      'cargo_arrivals_separation_window_hours_check',
      sql`${table.separationWindowHours} between 1 and 168`,
    ),
    check(
      'cargo_arrivals_delivery_deadline_business_days_check',
      sql`${table.deliveryDeadlineBusinessDays} between 1 and 60`,
    ),
    /** `timestamptz - timestamptz` é imutável: o prazo é exatamente a janela copiada, nunca outra. */
    check(
      'cargo_arrivals_separation_due_at_check',
      sql`(${table.separationWindowHours} is null and ${table.separationDueAt} is null) or extract(epoch from ${table.separationDueAt} - ${table.arrivedAt}) = ${table.separationWindowHours} * 3600`,
    ),
    check('cargo_arrivals_reference_check', sql`char_length(${table.reference}) between 1 and 120`),
    check(
      'cargo_arrivals_channel_check',
      sql`${table.channel} in (${raw(inList(CARGO_ARRIVAL_CHANNELS))})`,
    ),
    check(
      'cargo_arrivals_idempotency_key_check',
      sql`char_length(${table.idempotencyKey}) between 16 and 256`,
    ),
    check(
      'cargo_arrivals_request_fingerprint_check',
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'cargo_arrivals_status_check',
      sql`${table.status} in (${raw(inList(CARGO_ARRIVAL_STATUSES))})`,
    ),
  ],
)

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
    check(
      'cargo_arrival_documents_state_dates_check',
      sql`(${table.separationState} = ${raw(`'${expected}'`)} and ${table.receivedAt} is null and ${table.separatedAt} is null) or (${table.separationState} = ${raw(`'${received}'`)} and ${table.receivedAt} is not null and ${table.separatedAt} is null) or (${table.separationState} = ${raw(`'${separated}'`)} and ${table.receivedAt} is not null and ${table.separatedAt} >= ${table.receivedAt})`,
    ),
  ],
)
