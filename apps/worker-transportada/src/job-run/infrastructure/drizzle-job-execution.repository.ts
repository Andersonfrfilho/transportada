/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNull, lte, or } from 'drizzle-orm'

import { jobExecutions } from '../../database/job-execution.schema.js'
import type {
  ClaimJobExecutionParams,
  ClaimedJobExecution,
  FinishJobExecutionParams,
  JobExecutionPort,
  RenewJobExecutionLeaseParams,
  RenewedJobExecutionLease,
} from '../application/job-execution.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleJobExecutionRepository implements JobExecutionPort {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  /**
   * A escrita condicional é a idempotência do trilho: quem grava o lease ganhou o ciclo. A linha já
   * fechada não casa com `finished_at is null`, e a que outro processo segura não casa com o lease
   * vencido — as duas devolvem nada, e nada quer dizer "não é sua vez", não "erro".
   */
  async claim(params: ClaimJobExecutionParams): Promise<ClaimedJobExecution | undefined> {
    const [record] = await this.#database
      .update(jobExecutions)
      .set({ leaseExpiresAt: params.leaseExpiresAt })
      .where(
        and(
          eq(jobExecutions.id, params.executionId),
          isNull(jobExecutions.finishedAt),
          or(isNull(jobExecutions.leaseExpiresAt), lte(jobExecutions.leaseExpiresAt, params.now)),
        ),
      )
      .returning({ job: jobExecutions.job, origin: jobExecutions.origin })

    return record ?? undefined
  }

  /**
   * Renovar é a mesma escrita condicional do `claim`, com o lease **exato** que este processo
   * gravou no `where`: é o que impede um processo antigo, cujo lease já venceu e foi reivindicado
   * por outro, de puxar a linha de volta. O `cancel_requested_at` volta no `returning` porque é a
   * mesma linha — uma segunda consulta só para lê-lo dobraria as idas ao banco por batimento.
   */
  async renew(params: RenewJobExecutionLeaseParams): Promise<RenewedJobExecutionLease | undefined> {
    const [record] = await this.#database
      .update(jobExecutions)
      .set({ leaseExpiresAt: params.leaseExpiresAt })
      .where(
        and(
          eq(jobExecutions.id, params.executionId),
          isNull(jobExecutions.finishedAt),
          eq(jobExecutions.leaseExpiresAt, params.expectedLeaseExpiresAt),
        ),
      )
      .returning({ cancelRequestedAt: jobExecutions.cancelRequestedAt })

    if (record === undefined) return undefined
    return { cancelRequestedAt: record.cancelRequestedAt ?? undefined }
  }

  /**
   * O lease volta a nulo na mesma escrita: `job_executions_lease_check` recusa linha fechada com
   * lease de pé, e é esse CHECK que impede a varredura de abandonar o que já terminou.
   */
  async finish(params: FinishJobExecutionParams): Promise<void> {
    await this.#database
      .update(jobExecutions)
      .set({
        counters: params.counters,
        finishedAt: params.finishedAt,
        leaseExpiresAt: null,
        outcome: params.outcome,
      })
      .where(and(eq(jobExecutions.id, params.executionId), isNull(jobExecutions.finishedAt)))
  }
}
