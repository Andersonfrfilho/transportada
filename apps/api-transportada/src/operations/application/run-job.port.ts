/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ScheduledJob } from '../../shared/job-catalog.constant.js'

export type StartedManualExecution = Readonly<{ executionId: string }>

export type ManualExecutionRepository = Readonly<{
  /**
   * Devolve a execução quando a publicação falha. Sem isto a linha fica **aberta até o abandono**, e
   * o índice único recusa toda tentativa seguinte — o botão quebraria e ninguém saberia por quê.
   */
  release: (input: { readonly executionId: string }) => Promise<void>
  /**
   * `null` quando já existe execução aberta para a rotina. Quem decide é o índice
   * `job_executions_open_unique`, num `insert ... on conflict do nothing` — **nunca** um `select`
   * seguido de `if`, porque entre os dois cabe outra escrita.
   */
  startManual: (input: {
    readonly companyId: string
    readonly correlationId: string
    readonly job: ScheduledJob
    readonly requestedBy: string
  }) => Promise<StartedManualExecution | null>
}>

export type JobRunEnvelope = Readonly<{
  correlationId: string
  eventId: string
  occurredAt: string
  payload: Readonly<{ executionId: string; job: ScheduledJob; origin: 'manual' | 'schedule' }>
  type: string
  version: 1
}>

export type JobRunPublisher = Readonly<{ publish: (envelope: JobRunEnvelope) => Promise<void> }>

export type RunJobResult =
  | Readonly<{ executionId: string; outcome: 'started' }>
  | Readonly<{ outcome: 'already_running' }>
