/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobExecutionOrigin,
  JobOutcome,
  ScheduledJob,
} from '../../shared/job-catalog.constant.js'

export type JobRoutineContext = {
  readonly correlationId: string
  readonly executionId: string
  readonly job: ScheduledJob
  readonly origin: JobExecutionOrigin
  /**
   * Lido no **limite de unidade**, nunca no meio de uma: parar entre duas empresas deixa gravado o
   * que a anterior escreveu, e parar no meio deixa metade. Diz `true` tanto para parada pedida pelo
   * operador quanto para lease perdido — para a rotina os dois significam a mesma coisa, largar o
   * que ainda não começou.
   */
  isStopRequested(): boolean
}

export type JobRoutineResult = {
  /** Números, e só números: o cartão do painel os soma e os mostra sem saber o assunto de nenhum. */
  readonly counters: Readonly<Record<string, number>>
  readonly outcome: JobOutcome
}

/**
 * O invólucro não conhece o assunto de rotina nenhuma — ele abre a linha, chama isto e fecha a linha.
 * É esse desconhecimento que faz as quatro rotinas se comportarem igual diante de erro, parada e
 * processo morto.
 */
export type JobRoutine = {
  run(context: JobRoutineContext): Promise<JobRoutineResult>
}

/** Parcial de propósito: as rotinas entram uma a uma, e a que faltar fecha a linha em vez de sumir. */
export type JobRoutineRegistry = Partial<Record<ScheduledJob, JobRoutine>>
