/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O relógio no banco. Abrir a execução e avançar a janela é uma transação só: separadas, uma queda
 * entre as duas deixaria ou rotina publicada que dispara de novo na batida seguinte, ou janela
 * avançada sem ninguém correndo. Quem recusa a segunda execução aberta é o índice parcial
 * `job_executions_open_unique`, não uma leitura anterior — entre ler e inserir cabe outra batida.
 */
import { and, eq, lte } from 'drizzle-orm'

import type { CronDatabase } from '../../database/cron-database.types.js'
import { jobExecutions, jobSchedules } from '../../database/job-schedule.schema.js'
import type {
  DueJobSchedule,
  FinishScheduledExecutionParams,
  JobSchedulePort,
  StartScheduledExecutionParams,
  StartedScheduledExecution,
} from '../application/job-schedule.port.js'

type CreateDrizzleJobScheduleRepositoryDependencies = {
  readonly db: CronDatabase
}

export function createDrizzleJobScheduleRepository(
  dependencies: CreateDrizzleJobScheduleRepositoryDependencies,
): JobSchedulePort {
  return {
    async listDue({ now }): Promise<readonly DueJobSchedule[]> {
      const rows = await dependencies.db
        .select({ intervalSeconds: jobSchedules.intervalSeconds, job: jobSchedules.job })
        .from(jobSchedules)
        .where(and(eq(jobSchedules.enabled, true), lte(jobSchedules.nextRunAt, now)))
        .orderBy(jobSchedules.job)

      return rows
    },

    start(params: StartScheduledExecutionParams): Promise<StartedScheduledExecution | undefined> {
      return dependencies.db.transaction(async (transaction) => {
        const inserted = await transaction
          .insert(jobExecutions)
          .values({
            correlationId: params.correlationId,
            counters: {},
            job: params.job,
            origin: 'schedule',
            startedAt: params.startedAt,
          })
          .onConflictDoNothing()
          .returning({ id: jobExecutions.id })

        const executionId = inserted[0]?.id
        if (executionId === undefined) return undefined

        await transaction
          .update(jobSchedules)
          .set({ nextRunAt: params.nextRunAt, updatedAt: params.startedAt })
          .where(eq(jobSchedules.job, params.job))

        return { executionId }
      })
    },

    async finish(params: FinishScheduledExecutionParams): Promise<void> {
      await dependencies.db
        .update(jobExecutions)
        // O CHECK de lease exige que a execução encerrada não segure nenhum; é assim que a
        // varredura de abandono sabe que esta linha já não trava a rotina.
        .set({ finishedAt: params.finishedAt, leaseExpiresAt: null, outcome: params.outcome })
        .where(eq(jobExecutions.id, params.executionId))
    },
  }
}
