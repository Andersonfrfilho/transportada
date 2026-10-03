/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  CARGO_ARRIVAL_CHANNELS,
  CARGO_ARRIVAL_DOCUMENT_STATE,
  CARGO_ARRIVAL_EVENT_KIND,
  CARGO_ARRIVAL_EVENT_KINDS,
  CARGO_ARRIVAL_WIDE_EVENT_KINDS,
  type CargoArrivalChannel,
  type CargoArrivalDocumentState,
  type CargoArrivalEventKind,
} from '../shared/cargo-arrival.constant.js'
import { cargoArrivalDocuments, cargoArrivals } from './cargo-arrival.schema.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)
const quoted = (value: string): ReturnType<typeof sql.raw> => raw(`'${value}'`)
const withTimezone = { withTimezone: true } as const
const { documentAdded, documentReceived, documentSeparated } = CARGO_ARRIVAL_EVENT_KIND
const { expected, received, separated } = CARGO_ARRIVAL_DOCUMENT_STATE

/**
 * Spec 237 Fase 2 (ADR-0067): a trilha da chegada — quem, por qual canal, quando aconteceu e quando
 * foi contado. Append-only: a migration põe o trigger `BEFORE UPDATE OR DELETE`, como em
 * `trip_document_events`. O CHECK de forma repete a tabela de transições da política.
 */
export const cargoArrivalEvents = pgTable(
  'cargo_arrival_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    arrivalId: uuid('arrival_id').notNull(),
    arrivalDocumentId: uuid('arrival_document_id'),
    kind: varchar('kind', { length: 32 }).$type<CargoArrivalEventKind>().notNull(),
    fromState: varchar('from_state', { length: 16 }).$type<CargoArrivalDocumentState>(),
    toState: varchar('to_state', { length: 16 }).$type<CargoArrivalDocumentState>(),
    actorUserId: uuid('actor_user_id').notNull(),
    channel: varchar('channel', { length: 16 }).$type<CargoArrivalChannel>().notNull(),
    occurredAt: timestamp('occurred_at', withTimezone).notNull(),
    recordedAt: timestamp('recorded_at', withTimezone).notNull().defaultNow(),
    /** `route_assigned` guarda a rota anterior e a nova; os demais, nada ou o resumo do registro. */
    details: jsonb().$type<Readonly<Record<string, unknown>>>(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cargo_arrival_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.arrivalId],
      foreignColumns: [cargoArrivals.companyId, cargoArrivals.id],
      name: 'cargo_arrival_events_company_arrival_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** A nota do evento é desta chegada — nunca de outra, nem de outra empresa. */
    foreignKey({
      columns: [table.companyId, table.arrivalId, table.arrivalDocumentId],
      foreignColumns: [
        cargoArrivalDocuments.companyId,
        cargoArrivalDocuments.arrivalId,
        cargoArrivalDocuments.id,
      ],
      name: 'cargo_arrival_events_arrival_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'cargo_arrival_events_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    index('cargo_arrival_events_company_arrival_occurred_idx').on(
      table.companyId,
      table.arrivalId,
      table.occurredAt,
    ),
    index('cargo_arrival_events_company_arrival_document_idx')
      .on(table.companyId, table.arrivalId, table.arrivalDocumentId)
      .where(sql`${table.arrivalDocumentId} is not null`),
    check(
      'cargo_arrival_events_kind_check',
      sql`${table.kind} in (${raw(inList(CARGO_ARRIVAL_EVENT_KINDS))})`,
    ),
    check(
      'cargo_arrival_events_document_scope_check',
      sql`(${table.kind} in (${raw(inList(CARGO_ARRIVAL_WIDE_EVENT_KINDS))})) = (${table.arrivalDocumentId} is null)`,
    ),
    check(
      'cargo_arrival_events_state_shape_check',
      sql`case ${table.kind} when ${quoted(documentAdded)} then ${table.fromState} is null and ${table.toState} = ${quoted(expected)} when ${quoted(documentReceived)} then ${table.fromState} = ${quoted(expected)} and ${table.toState} = ${quoted(received)} when ${quoted(documentSeparated)} then ${table.fromState} = ${quoted(received)} and ${table.toState} = ${quoted(separated)} else ${table.fromState} is null and ${table.toState} is null end`,
    ),
    check(
      'cargo_arrival_events_channel_check',
      sql`${table.channel} in (${raw(inList(CARGO_ARRIVAL_CHANNELS))})`,
    ),
    check('cargo_arrival_events_details_check', sql`jsonb_typeof(${table.details}) = 'object'`),
  ],
)
