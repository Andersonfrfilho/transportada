/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * As quatro rotinas agendadas da instalação. O nome é a chave natural do relógio (`job_schedules`) e
 * o rótulo de toda execução — ele viaja no envelope, no CHECK do banco e na tela, então mudar um
 * valor daqui é migração, não renomeação.
 */
export const SCHEDULED_JOBS = [
  'nfe.distribution.pull',
  'fuel.price.pull',
  'nfse.status.pull',
  'notification.schedules.run',
] as const
export type ScheduledJob = (typeof SCHEDULED_JOBS)[number]

export const SCHEDULED_JOB_MAX_LENGTH = 40

/** Origem da execução: o ciclo que venceu, ou o operador que apertou o botão antes da hora. */
export const JOB_EXECUTION_ORIGINS = ['schedule', 'manual'] as const
export type JobExecutionOrigin = (typeof JOB_EXECUTION_ORIGINS)[number]

export const JOB_EXECUTION_ORIGIN_MAX_LENGTH = 10
export const JOB_OUTCOME_MAX_LENGTH = 40
