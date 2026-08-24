/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobExecutionOrigin,
  JobOutcome,
  ScheduledJob,
} from '../../shared/job-catalog.constant.js'

export type ClaimJobExecutionParams = {
  readonly executionId: string
  readonly leaseExpiresAt: Date
  readonly now: Date
}

export type ClaimedJobExecution = {
  readonly job: ScheduledJob
  readonly origin: JobExecutionOrigin
}

export type FinishJobExecutionParams = {
  readonly counters: Readonly<Record<string, number>>
  readonly executionId: string
  readonly finishedAt: Date
  readonly outcome: JobOutcome
}

/**
 * A idempotência do trilho é **a própria linha de execução**, não `processed_messages`: aquela tabela
 * exige `company_id` não nulo e uma execução de origem `schedule` não tem empresa — a instalação
 * inteira é o escopo. `claim` é a escrita condicional que decide: quem devolve linha ganhou o ciclo,
 * e quem não devolve ou chegou depois do fim ou encontrou um lease vivo de outro processo. Como no
 * cron de NFS-e, quem decide a transição é o banco.
 */
export type JobExecutionPort = {
  claim(params: ClaimJobExecutionParams): Promise<ClaimedJobExecution | undefined>
  finish(params: FinishJobExecutionParams): Promise<void>
}
