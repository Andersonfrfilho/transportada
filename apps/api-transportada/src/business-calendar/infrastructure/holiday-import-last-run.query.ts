/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 (cartão de status honesto): o desfecho do último ciclo ENCERRADO da rotina `holiday.provider.pull`.
 * `job_executions` é da instalação, não do cache do fornecedor, e por isso esta consulta mora fora das isentas do
 * contrato de isolamento. Só `outcome` e `finishedAt` saem: contador, correlação e solicitante ficam no banco.
 */
import { and, desc, eq, isNotNull } from 'drizzle-orm'

import { jobExecutions } from '../../database/job-schedule.schema.js'
import { HOLIDAY_PROVIDER_PULL_JOB } from '../../shared/holiday-provider.constant.js'
import type { HolidayImportLastRun } from '../application/holiday-import.port.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'

type Executor = Pick<BusinessCalendarDatabase, 'select'>

export async function readLastHolidayPullRun(
  executor: Executor,
): Promise<HolidayImportLastRun | null> {
  const [row] = await executor
    .select({ finishedAt: jobExecutions.finishedAt, outcome: jobExecutions.outcome })
    .from(jobExecutions)
    .where(
      and(eq(jobExecutions.job, HOLIDAY_PROVIDER_PULL_JOB), isNotNull(jobExecutions.finishedAt)),
    )
    .orderBy(desc(jobExecutions.startedAt))
    .limit(1)
  if (row === undefined || row.finishedAt === null || row.outcome === null) return null
  return { finishedAt: row.finishedAt, outcome: row.outcome }
}
