/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { boolean, check, integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import {
  DRIVER_REMINDER_DEFAULT_DWELL_MINUTES,
  DRIVER_REMINDER_DEFAULT_GRACE_MIN_MINUTES,
  DRIVER_REMINDER_DEFAULT_GRACE_PERCENT,
  DRIVER_REMINDER_DEFAULT_IDLE_MINUTES,
  DRIVER_REMINDER_DEFAULT_INTERVAL_MINUTES,
  DRIVER_REMINDER_DEFAULT_MAX_ATTEMPTS,
} from '../shared/driver-stop-reminder.constant.js'
import { companies } from './identity.schema.js'

/**
 * Spec 299 RF19: a cobrança do motorista, uma linha por empresa. Sem linha = desligada e com os padrões.
 * `operating_hours` é `[{ weekday, start, end }]` no fuso da empresa; vazio = sempre aberto.
 */
export const companyDriverReminderSettings = pgTable(
  'company_driver_reminder_settings',
  {
    companyId: uuid('company_id')
      .primaryKey()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    enabled: boolean().notNull().default(false),
    maxAttempts: integer('max_attempts').notNull().default(DRIVER_REMINDER_DEFAULT_MAX_ATTEMPTS),
    intervalMinutes: integer('interval_minutes')
      .notNull()
      .default(DRIVER_REMINDER_DEFAULT_INTERVAL_MINUTES),
    graceMinMinutes: integer('grace_min_minutes')
      .notNull()
      .default(DRIVER_REMINDER_DEFAULT_GRACE_MIN_MINUTES),
    gracePercent: integer('grace_percent').notNull().default(DRIVER_REMINDER_DEFAULT_GRACE_PERCENT),
    dwellMinutes: integer('dwell_minutes').notNull().default(DRIVER_REMINDER_DEFAULT_DWELL_MINUTES),
    idleMinutes: integer('idle_minutes').notNull().default(DRIVER_REMINDER_DEFAULT_IDLE_MINUTES),
    operatingHours: jsonb('operating_hours')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'company_driver_reminder_settings_max_attempts_check',
      sql`${table.maxAttempts} between 1 and 5`,
    ),
    check(
      'company_driver_reminder_settings_interval_check',
      sql`${table.intervalMinutes} between 10 and 120`,
    ),
    check(
      'company_driver_reminder_settings_grace_check',
      sql`${table.graceMinMinutes} >= 0 and ${table.gracePercent} between 0 and 100`,
    ),
    check('company_driver_reminder_settings_dwell_check', sql`${table.dwellMinutes} >= 0`),
    check(
      'company_driver_reminder_settings_idle_check',
      sql`${table.idleMinutes} between 10 and 240`,
    ),
    check(
      'company_driver_reminder_settings_operating_hours_check',
      sql`jsonb_typeof(${table.operatingHours}) = 'array'`,
    ),
  ],
)
