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

/**
 * `expectedLeaseExpiresAt` é o lease que **este** processo escreveu por último. Sem ele a renovação
 * seria cega: uma execução cujo lease venceu e foi reivindicada por outro worker teria o lease
 * roubado de volta pelo processo antigo, e os dois correriam a mesma rotina achando que a têm.
 */
export type RenewJobExecutionLeaseParams = {
  readonly executionId: string
  readonly expectedLeaseExpiresAt: Date
  readonly leaseExpiresAt: Date
}

export type RenewedJobExecutionLease = {
  /** A releitura do pedido de parada. Vem junto porque é a mesma linha e a mesma ida ao banco. */
  readonly cancelRequestedAt: Date | undefined
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
  /**
   * Estende o lease e relê o pedido de parada numa escrita só. `undefined` quer dizer que a linha
   * deixou de ser nossa — fechada por outro caminho, ou abandonada pela varredura e reivindicada
   * de novo. Nos dois casos o ciclo em curso perdeu o direito de gravar o desfecho dela.
   */
  renew(params: RenewJobExecutionLeaseParams): Promise<RenewedJobExecutionLease | undefined>
  finish(params: FinishJobExecutionParams): Promise<void>
}
