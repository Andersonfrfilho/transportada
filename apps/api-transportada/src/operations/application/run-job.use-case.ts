/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SCHEDULED_JOBS, type ScheduledJob } from '../../shared/job-catalog.constant.js'

import type { JobRunPublisher, ManualExecutionRepository, RunJobResult } from './run-job.port.js'

/** Cópia por valor do que o cron e o worker já declaram — as apps não importam código umas das outras. */
const JOB_RUN_EVENT_TYPE = 'transportada.job.run.requested'

export type RunJobDependencies = Readonly<{
  executions: ManualExecutionRepository
  publisher: JobRunPublisher
}>

export type RunJobInput = Readonly<{
  context: Readonly<{ companyId: string; userId: string }>
  correlationId: string
  job: ScheduledJob
}>

/**
 * O botão que o schema já previa (spec 072): `job_executions.requested_by`, o CHECK que o exige
 * quando `origin = 'manual'`, e o índice `job_executions_open_unique`, cujo comentário diz que ele
 * "sustenta o `409` do botão". Faltava o botão.
 *
 * ⚠️ **A ordem importa e não é intercambiável:** a linha nasce primeiro, e só depois a mensagem é
 * publicada. Publicar antes deixaria o consumidor procurando uma execução que ainda não existe —
 * ele reivindica a linha, não cria. E se a publicação falhar, a linha é devolvida: execução aberta
 * sem mensagem trava a rotina até a varredura de abandono, e nesse meio-tempo o botão responde
 * `409` sem que ninguém entenda por quê.
 */
export function createRunJobUseCase(dependencies: RunJobDependencies) {
  return {
    async run(input: RunJobInput): Promise<RunJobResult> {
      if (!SCHEDULED_JOBS.includes(input.job)) {
        throw new Error(`unknown scheduled job: ${input.job}`)
      }

      const started = await dependencies.executions.startManual({
        companyId: input.context.companyId,
        correlationId: input.correlationId,
        job: input.job,
        requestedBy: input.context.userId,
      })
      if (started === null) return { outcome: 'already_running' }

      try {
        await dependencies.publisher.publish({
          correlationId: input.correlationId,
          eventId: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          payload: { executionId: started.executionId, job: input.job, origin: 'manual' },
          type: JOB_RUN_EVENT_TYPE,
          version: 1,
        })
      } catch (cause) {
        await dependencies.executions
          .release({ executionId: started.executionId })
          .catch(() => undefined)
        throw cause
      }

      return { executionId: started.executionId, outcome: 'started' }
    },
  }
}
