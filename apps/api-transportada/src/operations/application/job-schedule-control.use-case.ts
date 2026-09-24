/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SCHEDULED_JOBS, type ScheduledJob } from '../../shared/job-catalog.constant.js'
import { ApiError } from '../../shared/api.error.js'
import type { JobScheduleControlRepository, JobScheduleRow } from './job-schedule-control.port.js'

export type JobScheduleControlDependencies = Readonly<{
  repository: JobScheduleControlRepository
}>

/**
 * Spec 161 T21: o botão de ligar/desligar que faltava ao lado do de rodar agora. `paused_at` e
 * `paused_by` **são** a trilha — quem desligou e quando —, gravados na mesma linha que o
 * agendador lê; o log de acesso da requisição (`http_request_completed`) já carrega IP e
 * correlation id de toda chamada, inclusive esta, então nada aqui duplica isso.
 */
export function createJobScheduleControlUseCase(dependencies: JobScheduleControlDependencies): {
  readonly listSchedules: () => Promise<readonly JobScheduleRow[]>
  readonly pause: (input: {
    readonly actorUserId: string
    readonly job: ScheduledJob
  }) => Promise<JobScheduleRow>
  readonly resume: (input: { readonly job: ScheduledJob }) => Promise<JobScheduleRow>
} {
  return {
    listSchedules: () => dependencies.repository.listSchedules(),

    async pause(input) {
      assertScheduledJob(input.job)
      const row = await dependencies.repository.pause(input)
      if (row === null) throw scheduleNotFoundError()
      return row
    },

    async resume(input) {
      assertScheduledJob(input.job)
      const row = await dependencies.repository.resume(input)
      if (row === null) throw scheduleNotFoundError()
      return row
    },
  }
}

function assertScheduledJob(job: string): asserts job is ScheduledJob {
  if (!SCHEDULED_JOBS.includes(job as ScheduledJob)) {
    throw new ApiError({
      code: 'UNKNOWN_SCHEDULED_JOB',
      message: 'Unknown scheduled job',
      status: 400,
    })
  }
}

function scheduleNotFoundError(): ApiError {
  return new ApiError({
    code: 'JOB_SCHEDULE_NOT_FOUND',
    message: 'Job schedule not found',
    status: 404,
  })
}
