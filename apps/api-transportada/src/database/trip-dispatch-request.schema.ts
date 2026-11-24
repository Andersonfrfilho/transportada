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
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { fleetDrivers } from './fleet.schema.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import { trips } from './trip.schema.js'

/** `open` até o escritório aprovar ou recusar, o prazo vencer, ou o despacho falhar (carga aberta, por exemplo). */
export const TRIP_DISPATCH_REQUEST_STATUSES = [
  'open',
  'approved',
  'declined',
  'expired',
  'failed',
] as const
export type TripDispatchRequestStatus = (typeof TRIP_DISPATCH_REQUEST_STATUSES)[number]

/**
 * O motorista mandou "saí"/"cheguei" numa viagem ainda não despachada e o bot **pergunta ao responsável do
 * escritório** (quem planejou a viagem) se ela pode ser despachada. Um pedido aberto por viagem (índice parcial).
 *
 * `pending_events` guarda o que o motorista mandou, **com a hora original**, para o bot lançar na ordem quando o
 * despacho sair. O responsável é uma pessoa com telefone verificado; a resposta só vale dele e com a permissão de
 * despachar. Sem resposta no prazo, o pedido vence e nada é despachado sozinho.
 */
export const tripDispatchRequests = pgTable(
  'trip_dispatch_requests',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    /** O grupo (ou o chat direto) do motorista, onde o bot avisa o desfecho. */
    groupJid: text('group_jid').notNull(),
    responderUserId: uuid('responder_user_id').notNull(),
    responderPhone: text('responder_phone').notNull(),
    status: text().$type<TripDispatchRequestStatus>().notNull().default('open'),
    pendingEvents: jsonb('pending_events').$type<readonly Record<string, unknown>[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /** Só nos desfechos que não são aprovação: o motivo em uma palavra (`cargo_open`, `not_allowed`…). */
    resolutionNote: text('resolution_note'),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_dispatch_requests_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_dispatch_requests_company_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'trip_dispatch_requests_company_driver_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('trip_dispatch_requests_company_id_unique').on(table.companyId, table.id),
    uniqueIndex('trip_dispatch_requests_company_trip_open_unique')
      .on(table.companyId, table.tripId)
      .where(sql`${table.status} = 'open'`),
    index('trip_dispatch_requests_open_expires_idx')
      .on(table.expiresAt)
      .where(sql`${table.status} = 'open'`),
    index('trip_dispatch_requests_open_responder_idx')
      .on(table.companyId, table.responderPhone)
      .where(sql`${table.status} = 'open'`),
    check(
      'trip_dispatch_requests_status_check',
      sql`${table.status} in (${sql.raw(inList(TRIP_DISPATCH_REQUEST_STATUSES))})`,
    ),
    check(
      'trip_dispatch_requests_resolved_check',
      sql`(${table.status} = 'open') = (${table.resolvedAt} is null)`,
    ),
    check(
      'trip_dispatch_requests_responder_phone_check',
      sql`${table.responderPhone} ~ '^[0-9]{8,20}$'`,
    ),
  ],
)
