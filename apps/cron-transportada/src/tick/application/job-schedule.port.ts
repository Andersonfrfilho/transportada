/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { JobWrapperOutcome, ScheduledJob } from '../../shared/job-catalog.constant.js'

export type DueJobSchedule = {
  readonly intervalSeconds: number
  readonly job: ScheduledJob
}

export type StartScheduledExecutionParams = {
  readonly correlationId: string
  readonly job: ScheduledJob
  readonly nextRunAt: Date
  readonly startedAt: Date
}

export type StartedScheduledExecution = {
  readonly executionId: string
}

export type FinishScheduledExecutionParams = {
  readonly executionId: string
  readonly finishedAt: Date
  readonly outcome: JobWrapperOutcome
}

export type AbandonExpiredExecutionsParams = {
  /** Execução aberta sem lease e mais velha que isto é mensagem que nunca chegou ao worker. */
  readonly pickupDeadline: Date
  readonly now: Date
}

export type JobSchedulePort = {
  /**
   * Fecha em `abandoned` a execução cujo lease venceu — processo morto no meio — e a que ninguém
   * reivindicou dentro do prazo de retirada. Roda **antes** da seleção do que venceu: é o índice
   * parcial `job_executions_open_unique` que recusa a execução nova, e uma linha morta de pé
   * travaria a rotina em toda batida seguinte.
   */
  abandonExpired(params: AbandonExpiredExecutionsParams): Promise<number>
  listDue(params: { readonly now: Date }): Promise<readonly DueJobSchedule[]>
  /**
   * Abre a execução e avança a janela na **mesma** transação. Devolve `undefined` quando a rotina
   * já tem execução aberta: quem recusa é o índice parcial `job_executions_open_unique`, e é por
   * ele que a janela não avança — a batida seguinte tenta de novo.
   */
  start(params: StartScheduledExecutionParams): Promise<StartedScheduledExecution | undefined>
  finish(params: FinishScheduledExecutionParams): Promise<void>
}
