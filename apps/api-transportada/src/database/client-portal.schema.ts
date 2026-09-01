/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, userCompanyMemberships } from './identity.schema.js'
import { contractors } from './delivery-client.schema.js'
import { trips } from './trip.schema.js'
import { fleetDrivers } from './fleet.schema.js'

/**
 * ADR-0050: **o contratante é usuário, não visitante.** Ele entra pelo mesmo Keycloak, com o mesmo
 * convite e a mesma membership de todo mundo — o que muda é o papel (`contractor`) e o fato de a
 * conta dele não enxergar a empresa inteira, e sim os **documentos** amarrados aqui.
 *
 * O vínculo é com o `contractors` da 060 porque é ele que já carrega o documento e o período de
 * fechamento; amarrar a um CNPJ solto criaria uma segunda lista de contratante para divergir da
 * primeira.
 */
export const contractorPortalBindings = pgTable(
  'contractor_portal_bindings',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_portal_bindings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * O par com `companyId` é o que impede amarrar a conta de uma empresa ao contratante de outra —
     * a FK simples aceitaria, porque as duas linhas existem.
     */
    foreignKey({
      columns: [table.membershipId, table.companyId],
      foreignColumns: [userCompanyMemberships.id, userCompanyMemberships.companyId],
      name: 'contractor_portal_bindings_membership_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'contractor_portal_bindings_contractor_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    /** Uma conta pode responder por mais de um CNPJ do grupo; o mesmo par, não. */
    unique('contractor_portal_bindings_membership_contractor_unique').on(
      table.membershipId,
      table.contractorId,
    ),
    index('contractor_portal_bindings_membership_idx').on(table.companyId, table.membershipId),
  ],
)

/**
 * ADR-0050 §5: onde a carga está **agora**. Posição contínua é dado pessoal do trabalhador, e por
 * isso esta é a tabela de vida mais curta do produto: ela é apagada quando a viagem fecha.
 *
 * O que sobrevive ao fechamento é o carimbo da entrega, que a 057 já guarda — a pergunta "a que
 * horas ele entregou?" continua respondida; "por onde ele andou o dia inteiro", não.
 */
export const tripLocationPings = pgTable(
  'trip_location_pings',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    latitude: numeric({ precision: 10, scale: 7 }).notNull(),
    longitude: numeric({ precision: 10, scale: 7 }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_location_pings_trip_fk',
    })
      /** A viagem apagada leva o rastro junto: ele não tem por que sobreviver a ela. */
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_location_pings_driver_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    /** A leitura é sempre "a última desta viagem": o índice é por viagem e hora, nesta ordem. */
    index('trip_location_pings_trip_idx').on(table.companyId, table.tripId, table.recordedAt),
    check(
      'trip_location_pings_coordinates_check',
      sql`${table.latitude} between -90 and 90 and ${table.longitude} between -180 and 180`,
    ),
  ],
)
