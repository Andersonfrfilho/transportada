/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Modelo em memória das duas tabelas do relógio, fiel no que decide a batida: a seleção do que
 * venceu e o índice parcial `job_executions_open_unique`, que é quem recusa a segunda execução
 * aberta da mesma rotina. Um duplo que só devolvesse o que a asserção espera provaria a asserção,
 * não o ciclo — a recusa por conflito tem de nascer do modelo, como nasce do banco.
 */
import type { ScheduledJob } from '../../src/shared/job-catalog.constant.js'
import type {
  DueJobSchedule,
  FinishScheduledExecutionParams,
  JobSchedulePort,
  StartScheduledExecutionParams,
  StartedScheduledExecution,
} from '../../src/tick/application/job-schedule.port.js'

export type ScheduleRow = {
  enabled: boolean
  intervalSeconds: number
  job: ScheduledJob
  nextRunAt: Date
}

export type ExecutionRow = {
  correlationId: string
  finishedAt: Date | undefined
  id: string
  job: ScheduledJob
  origin: 'schedule'
  outcome: string | undefined
  startedAt: Date
}

export type JobScheduleDouble = JobSchedulePort & {
  readonly executions: readonly ExecutionRow[]
  readonly schedules: readonly ScheduleRow[]
  scheduleOf(job: ScheduledJob): ScheduleRow
}

export function createJobScheduleDouble(rows: readonly ScheduleRow[]): JobScheduleDouble {
  const schedules = rows.map((row) => ({ ...row }))
  const executions: ExecutionRow[] = []
  let sequence = 0

  function scheduleOf(job: ScheduledJob): ScheduleRow {
    const row = schedules.find((candidate) => candidate.job === job)
    if (row === undefined) throw new Error(`unknown schedule ${job}`)
    return row
  }

  return {
    executions,
    schedules,
    scheduleOf,

    listDue({ now }): Promise<readonly DueJobSchedule[]> {
      return Promise.resolve(
        schedules
          .filter((row) => row.enabled && row.nextRunAt.getTime() <= now.getTime())
          .map((row) => ({ intervalSeconds: row.intervalSeconds, job: row.job })),
      )
    },

    start(params: StartScheduledExecutionParams): Promise<StartedScheduledExecution | undefined> {
      const hasOpenExecution = executions.some(
        (row) => row.job === params.job && row.finishedAt === undefined,
      )
      if (hasOpenExecution) return Promise.resolve(undefined)

      sequence += 1
      const id = `00000000-0000-4000-8000-0000000000${String(sequence).padStart(2, '0')}`
      executions.push({
        correlationId: params.correlationId,
        finishedAt: undefined,
        id,
        job: params.job,
        origin: 'schedule',
        outcome: undefined,
        startedAt: params.startedAt,
      })
      scheduleOf(params.job).nextRunAt = params.nextRunAt
      return Promise.resolve({ executionId: id })
    },

    finish(params: FinishScheduledExecutionParams): Promise<void> {
      const row = executions.find((candidate) => candidate.id === params.executionId)
      if (row === undefined) throw new Error(`unknown execution ${params.executionId}`)
      row.finishedAt = params.finishedAt
      row.outcome = params.outcome
      return Promise.resolve()
    },
  }
}
