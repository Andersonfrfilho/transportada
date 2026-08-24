/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  JOB_EXECUTION_ORIGIN_MAX_LENGTH,
  JOB_EXECUTION_ORIGINS,
  JOB_OUTCOME_MAX_LENGTH,
  JOB_TICK_INTERVAL_SECONDS,
  SCHEDULED_JOB_MAX_LENGTH,
  SCHEDULED_JOBS,
  type JobExecutionOrigin,
  type ScheduledJob,
} from '../shared/job-catalog.constant.js'
import { companies, identityUsers, userCompanyMemberships } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

/** A batida do cron é o piso de granularidade: nada abaixo dela seria janela que nunca vence. */
export const JOB_SCHEDULE_MINIMUM_INTERVAL_SECONDS = JOB_TICK_INTERVAL_SECONDS

/**
 * O relógio das rotinas, uma linha por rotina. A cadência é **da instalação** e por isso a tabela
 * não tem `company_id`: quem participa de cada ciclo continua sendo decidido por empresa (o opt-in
 * de distribuição, a credencial de NFS-e), mas o intervalo é do ambiente, como o `cronSchedule` do
 * Railway que ele substitui. O nome da rotina é a chave primária — são quatro linhas fixas, e um
 * `id` opaco só acrescentaria um passo entre a rota e a linha que ela quer.
 */
export const jobSchedules = pgTable(
  'job_schedules',
  {
    job: varchar({ length: SCHEDULED_JOB_MAX_LENGTH }).$type<ScheduledJob>().primaryKey(),
    intervalSeconds: integer('interval_seconds').notNull(),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
    enabled: boolean().notNull().default(true),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    pausedBy: uuid('paused_by').references(() => identityUsers.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('job_schedules_job_check', sql`${table.job} in (${sql.raw(inList(SCHEDULED_JOBS))})`),
    check(
      'job_schedules_interval_check',
      sql`${table.intervalSeconds} >= ${sql.raw(String(JOB_SCHEDULE_MINIMUM_INTERVAL_SECONDS))}`,
    ),
    // Rotina pausada é estado que se anuncia: sem desde quando e por quem, ela morre calada
    check(
      'job_schedules_pause_check',
      sql`${table.enabled} = (${table.pausedAt} is null) and (${table.pausedAt} is null) = (${table.pausedBy} is null)`,
    ),
  ],
)

/**
 * Uma linha por ciclo, agendado ou manual. `company_id` e `requested_by` são anuláveis porque o
 * ciclo que vence não tem quem o peça — mas quando existe operador, ele tem de ser membro da
 * empresa que pediu, e é a chave composta que garante isso.
 */
export const jobExecutions = pgTable(
  'job_executions',
  {
    id: uuid().defaultRandom().primaryKey(),
    job: varchar({ length: SCHEDULED_JOB_MAX_LENGTH }).$type<ScheduledJob>().notNull(),
    origin: varchar({ length: JOB_EXECUTION_ORIGIN_MAX_LENGTH })
      .$type<JobExecutionOrigin>()
      .notNull(),
    companyId: uuid('company_id').references(() => companies.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
    requestedBy: uuid('requested_by'),
    correlationId: varchar('correlation_id', { length: 120 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    outcome: varchar({ length: JOB_OUTCOME_MAX_LENGTH }),
    counters: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.requestedBy, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'job_executions_requester_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * No máximo uma execução aberta por rotina — é este índice que sustenta o `409` do botão.
     * Quem decide se a aberta ainda está viva é o lease, não ele: `now()` não é imutável e não
     * entra em predicado de índice, então a varredura de abandono é que fecha a linha vencida.
     */
    uniqueIndex('job_executions_open_unique')
      .on(table.job)
      .where(sql`${table.finishedAt} is null`),
    index('job_executions_job_started_at_idx').on(table.job, table.startedAt),
    check('job_executions_job_check', sql`${table.job} in (${sql.raw(inList(SCHEDULED_JOBS))})`),
    check(
      'job_executions_origin_check',
      sql`${table.origin} in (${sql.raw(inList(JOB_EXECUTION_ORIGINS))})`,
    ),
    check(
      'job_executions_requester_check',
      sql`(${table.origin} = 'manual') = (${table.requestedBy} is not null) and (${table.requestedBy} is null) = (${table.companyId} is null)`,
    ),
    check(
      'job_executions_finish_check',
      sql`(${table.finishedAt} is null) = (${table.outcome} is null) and (${table.finishedAt} is null or ${table.finishedAt} >= ${table.startedAt})`,
    ),
    // Execução encerrada não segura lease; é assim que a varredura de abandono destrava a rotina
    check(
      'job_executions_lease_check',
      sql`${table.finishedAt} is null or ${table.leaseExpiresAt} is null`,
    ),
    check('job_executions_correlation_id_check', sql`length(${table.correlationId}) > 0`),
  ],
)
