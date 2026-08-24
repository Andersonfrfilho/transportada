/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor do schema da API — as apps não importam código-fonte uma da outra e as migrations
 * rodam só na API. Redução: aqui é o executor, então `job_schedules` não aparece (quem lê o relógio
 * é o cron) e de `job_executions` ficam de fora as colunas que só o painel escreve (`requested_by`,
 * `company_id`). Mudou a tabela lá? confira aqui.
 */
import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import type {
  JobExecutionOrigin,
  JobOutcome,
  ScheduledJob,
} from '../shared/job-catalog.constant.js'

export const jobExecutions = pgTable('job_executions', {
  id: uuid().defaultRandom().primaryKey(),
  job: varchar({ length: 40 }).$type<ScheduledJob>().notNull(),
  origin: varchar({ length: 10 }).$type<JobExecutionOrigin>().notNull(),
  correlationId: varchar('correlation_id', { length: 120 }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  outcome: varchar({ length: 40 }).$type<JobOutcome>(),
  counters: jsonb().notNull(),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
})
