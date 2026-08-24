/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor do schema da API — as apps não importam código-fonte uma da outra e as migrations
 * rodam só na API. Redução: a batida lê o relógio e abre a execução, então nem as colunas que só o
 * executor escreve (`counters`, `cancel_requested_at`) nem as do operador (`paused_by`,
 * `requested_by`) fazem parte do que ela toca. Mudou a tabela lá? confira aqui.
 */
import { boolean, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import type { JobExecutionOrigin, ScheduledJob } from '../shared/job-catalog.constant.js'

export const jobSchedules = pgTable('job_schedules', {
  job: varchar({ length: 40 }).$type<ScheduledJob>().primaryKey(),
  intervalSeconds: integer('interval_seconds').notNull(),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  enabled: boolean().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const jobExecutions = pgTable('job_executions', {
  id: uuid().defaultRandom().primaryKey(),
  job: varchar({ length: 40 }).$type<ScheduledJob>().notNull(),
  origin: varchar({ length: 10 }).$type<JobExecutionOrigin>().notNull(),
  correlationId: varchar('correlation_id', { length: 120 }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  outcome: varchar({ length: 40 }),
  counters: jsonb().notNull(),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
})
