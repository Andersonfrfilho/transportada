/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A batida do agendador: uma instância segura o advisory lock, lê o que venceu, abre a execução de
 * cada rotina e a publica no trilho. Ela não sabe o que rotina nenhuma faz — quem executa é o
 * worker, e é isso que mantém os clientes de terceiro num app só.
 */
import type { CronLogger } from '../../config/cron.types.js'
import type { AdvisoryLockPort } from '../../shared/advisory-lock.port.js'
import { jobRunEnvelopeV1Schema } from '../domain/job-run-envelope.schema.js'
import { resolveNextRunAt } from '../domain/next-run.policy.js'
import {
  JOB_RUN_EVENT_TYPE,
  JOB_TICK_LOCK_KEY,
  JOB_TICK_PUBLISH_FAILURE_OUTCOME,
} from '../domain/tick.constant.js'
import type { JobRunPublisherPort } from './job-run-publisher.port.js'
import type { DueJobSchedule, JobSchedulePort } from './job-schedule.port.js'

export type TickCycleResult = {
  readonly acquiredLock: boolean
  readonly dueCount: number
  readonly failedCount: number
  readonly publishedCount: number
  readonly skippedCount: number
}

export type TickCycleDependencies = {
  readonly correlationId: string
  readonly lock: AdvisoryLockPort
  readonly logger: CronLogger
  readonly newEventId: () => string
  readonly now: Date
  readonly publisher: JobRunPublisherPort
  readonly schedules: JobSchedulePort
}

const SKIPPED_RESULT: TickCycleResult = {
  acquiredLock: false,
  dueCount: 0,
  failedCount: 0,
  publishedCount: 0,
  skippedCount: 0,
}

export async function runTickCycle(dependencies: TickCycleDependencies): Promise<TickCycleResult> {
  const acquired = await dependencies.lock.tryAcquire({ lockKey: JOB_TICK_LOCK_KEY })
  if (!acquired) {
    dependencies.logger.info('cron_tick_lock_not_acquired', { lockKey: JOB_TICK_LOCK_KEY })
    return SKIPPED_RESULT
  }

  try {
    return await publishDueJobs(dependencies)
  } finally {
    await dependencies.lock.release({ lockKey: JOB_TICK_LOCK_KEY })
  }
}

async function publishDueJobs(dependencies: TickCycleDependencies): Promise<TickCycleResult> {
  const due = await dependencies.schedules.listDue({ now: dependencies.now })

  let publishedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const schedule of due) {
    try {
      const published = await publishDueJob(dependencies, schedule)
      if (published) publishedCount += 1
      else skippedCount += 1
    } catch (error) {
      failedCount += 1
      dependencies.logger.error('cron_tick_job_publish_failed', {
        error: error instanceof Error ? error.message : 'unknown',
        job: schedule.job,
      })
    }
  }

  return {
    acquiredLock: true,
    dueCount: due.length,
    failedCount,
    publishedCount,
    skippedCount,
  }
}

async function publishDueJob(
  dependencies: TickCycleDependencies,
  schedule: DueJobSchedule,
): Promise<boolean> {
  const started = await dependencies.schedules.start({
    correlationId: dependencies.correlationId,
    job: schedule.job,
    nextRunAt: resolveNextRunAt({
      intervalSeconds: schedule.intervalSeconds,
      now: dependencies.now,
    }),
    startedAt: dependencies.now,
  })

  if (started === undefined) {
    dependencies.logger.info('cron_tick_job_still_running', { job: schedule.job })
    return false
  }

  const envelope = jobRunEnvelopeV1Schema.parse({
    correlationId: dependencies.correlationId,
    eventId: dependencies.newEventId(),
    occurredAt: dependencies.now.toISOString(),
    payload: { executionId: started.executionId, job: schedule.job, origin: 'schedule' },
    type: JOB_RUN_EVENT_TYPE,
    version: 1,
  })

  try {
    await dependencies.publisher.publish({ envelope })
  } catch (error) {
    // A linha aberta é fechada aqui mesmo: sem isso, a rotina ficaria travada até a varredura de
    // lease, e o botão recusaria com 409 sem que nada estivesse correndo.
    await dependencies.schedules.finish({
      executionId: started.executionId,
      finishedAt: dependencies.now,
      outcome: JOB_TICK_PUBLISH_FAILURE_OUTCOME,
    })
    throw error
  }

  return true
}
