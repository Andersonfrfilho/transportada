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
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  DRIVER_STOP_REMINDER_CHANNELS,
  DRIVER_STOP_REMINDER_CLOSED_REASONS,
  DRIVER_STOP_REMINDER_ORIGIN_KINDS,
  DRIVER_STOP_REMINDER_STAGES,
  DRIVER_STOP_REMINDER_STATUSES,
  type DriverStopReminderChannel,
  type DriverStopReminderClosedReason,
  type DriverStopReminderOriginKind,
  type DriverStopReminderStage,
  type DriverStopReminderStatus,
} from '../shared/driver-stop-reminder.constant.js'
import { fleetDrivers } from './fleet.schema.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import { tripStops, trips } from './trip.schema.js'

/**
 * Spec 299: o lembrete que cobra o motorista de uma parada — um por (parada, etapa) enquanto `pending`.
 * `version` é o cadeado da reserva da tentativa (dois robôs não enviam a mesma); `dispatching_until`
 * segura a reserva em andamento. `dismissed_by_user_id` fica sem chave estrangeira de propósito: é rastro
 * de quem dispensou, e apagar o usuário não pode apagar o rastro.
 */
export const driverStopReminders = pgTable(
  'driver_stop_reminders',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    tripStopId: uuid('trip_stop_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    stage: varchar({ length: 16 }).$type<DriverStopReminderStage>().notNull(),
    status: varchar({ length: 16 }).$type<DriverStopReminderStatus>().notNull(),
    anchorAt: timestamp('anchor_at', { withTimezone: true }).notNull(),
    originKind: varchar('origin_kind', { length: 16 })
      .$type<DriverStopReminderOriginKind>()
      .notNull(),
    travelSeconds: integer('travel_seconds'),
    expectedAt: timestamp('expected_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    attempts: integer().notNull().default(0),
    postponements: integer().notNull().default(0),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    lastChannel: varchar('last_channel', { length: 16 }).$type<DriverStopReminderChannel>(),
    lastProviderMessageId: text('last_provider_message_id'),
    dispatchingUntil: timestamp('dispatching_until', { withTimezone: true }),
    closedReason: varchar('closed_reason', { length: 24 }).$type<DriverStopReminderClosedReason>(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    dismissedByUserId: uuid('dismissed_by_user_id'),
    version: bigint({ mode: 'bigint' })
      .notNull()
      .default(sql`1`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'driver_stop_reminders_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'driver_stop_reminders_company_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripStopId],
      foreignColumns: [tripStops.companyId, tripStops.id],
      name: 'driver_stop_reminders_company_trip_stop_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'driver_stop_reminders_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    uniqueIndex('driver_stop_reminders_pending_stop_stage_unique')
      .on(table.tripStopId, table.stage)
      .where(sql`${table.status} = 'pending'`),
    index('driver_stop_reminders_status_due_idx').on(table.status, table.dueAt),
    check(
      'driver_stop_reminders_stage_check',
      sql`${table.stage} in (${sql.raw(inList(DRIVER_STOP_REMINDER_STAGES))})`,
    ),
    check(
      'driver_stop_reminders_status_check',
      sql`${table.status} in (${sql.raw(inList(DRIVER_STOP_REMINDER_STATUSES))})`,
    ),
    check(
      'driver_stop_reminders_origin_kind_check',
      sql`${table.originKind} in (${sql.raw(inList(DRIVER_STOP_REMINDER_ORIGIN_KINDS))})`,
    ),
    check(
      'driver_stop_reminders_last_channel_check',
      sql`${table.lastChannel} is null or ${table.lastChannel} in (${sql.raw(inList(DRIVER_STOP_REMINDER_CHANNELS))})`,
    ),
    check(
      'driver_stop_reminders_closed_reason_check',
      sql`${table.closedReason} is null or ${table.closedReason} in (${sql.raw(inList(DRIVER_STOP_REMINDER_CLOSED_REASONS))})`,
    ),
    check(
      'driver_stop_reminders_counters_check',
      sql`${table.attempts} >= 0 and ${table.postponements} >= 0`,
    ),
  ],
)
