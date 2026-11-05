/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  ADDRESS_CORRECTION_SUGGESTION_STATUSES,
  type AddressCorrectionSuggestionStatus,
} from '../shared/address-correction-suggestion.constant.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import { tripStopEvents, tripStops } from './trip.schema.js'

/**
 * ADR-0113 §2.5: o ponto da chegada do motorista que **não** pôde ser gravado direto (endereço sem
 * coordenada, fora da tolerância, ou confiável a mais de 300 m). O escritório aplica ou descarta em
 * `/pendencias`. `geocoded_addresses` é global; a sugestão não — carrega `company_id` e o painel só
 * lista a da empresa do token. `address_key` não é FK: endereço sem linha em `geocoded_addresses` (sem
 * coordenada nenhuma) também gera sugestão.
 */
export const addressCorrectionSuggestions = pgTable(
  'address_correction_suggestions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    addressKey: text('address_key').notNull(),
    tripStopId: uuid('trip_stop_id'),
    /** Chave de idempotência da sugestão (`address-correction:<eventId>`): o reenvio não duplica. */
    tripStopEventId: uuid('trip_stop_event_id'),
    latitude: numeric({ precision: 10, scale: 7 }).notNull(),
    longitude: numeric({ precision: 10, scale: 7 }).notNull(),
    /** Distância do ponto atual do endereço; `null` quando o endereço não tinha coordenada. */
    distanceMeters: integer('distance_meters'),
    status: varchar({ length: 16 })
      .$type<AddressCorrectionSuggestionStatus>()
      .notNull()
      .default('pending'),
    createdByUserId: uuid('created_by_user_id').notNull(),
    decidedByUserId: uuid('decided_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'address_correction_suggestions_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.tripStopId],
      foreignColumns: [tripStops.id],
      name: 'address_correction_suggestions_trip_stop_id_fk',
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.tripStopEventId],
      foreignColumns: [tripStopEvents.id],
      name: 'address_correction_suggestions_trip_stop_event_id_fk',
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.createdByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'address_correction_suggestions_created_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.decidedByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'address_correction_suggestions_decided_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    index('address_correction_suggestions_company_status_created_idx').on(
      table.companyId,
      table.status,
      table.createdAt,
    ),
    /** Spec 294 S9: uma sugestão pendente por endereço da empresa; a chegada seguinte atualiza a pendente. */
    uniqueIndex('address_correction_suggestions_company_address_pending_unique')
      .on(table.companyId, table.addressKey)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex('address_correction_suggestions_company_event_unique')
      .on(table.companyId, table.tripStopEventId)
      .where(sql`${table.tripStopEventId} is not null`),
    check(
      'address_correction_suggestions_status_check',
      sql`${table.status} in (${sql.raw(inList(ADDRESS_CORRECTION_SUGGESTION_STATUSES))})`,
    ),
    check(
      'address_correction_suggestions_decided_check',
      sql`(${table.status} = 'pending') = (${table.decidedAt} is null)`,
    ),
    check(
      'address_correction_suggestions_distance_check',
      sql`${table.distanceMeters} is null or ${table.distanceMeters} >= 0`,
    ),
    check(
      'address_correction_suggestions_latitude_check',
      sql`${table.latitude} between -90 and 90`,
    ),
    check(
      'address_correction_suggestions_longitude_check',
      sql`${table.longitude} between -180 and 180`,
    ),
  ],
)
