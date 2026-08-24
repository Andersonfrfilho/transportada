/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Modelo em memória da linha de `job_executions`, fiel nas três escritas condicionais que o trilho
 * usa: `claim`, `renew` e `finish`. Cada uma repete no duplo o `where` que o repositório manda ao
 * banco — um duplo que devolvesse o que a asserção espera provaria a asserção, não o ciclo.
 */
import type {
  ClaimJobExecutionParams,
  FinishJobExecutionParams,
  JobExecutionPort,
  RenewJobExecutionLeaseParams,
  RenewedJobExecutionLease,
} from '../../src/job-run/application/job-execution.port.js'
import type { IntervalScheduler } from '../../src/job-run/application/lease-heartbeat.js'
import type { JobExecutionOrigin, ScheduledJob } from '../../src/shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

export type ExecutionRow = {
  cancelRequestedAt: Date | undefined
  counters: Readonly<Record<string, number>>
  finishedAt: Date | undefined
  job: ScheduledJob
  leaseExpiresAt: Date | undefined
  origin: JobExecutionOrigin
  outcome: string | undefined
}

export type ExecutionDouble = JobExecutionPort & {
  /** Quantas vezes o batimento alcançou o banco — inclusive as que não casaram com o `where`. */
  readonly renewals: RenewJobExecutionLeaseParams[]
  readonly row: ExecutionRow
  /** Faz o `renew` estourar, para provar que queda de banco não derruba a rotina em curso. */
  failRenewals(reason: Error | undefined): void
}

export type ExecutionDoubleParams = {
  readonly cancelRequestedAt?: Date
  readonly job?: ScheduledJob
  readonly origin?: JobExecutionOrigin
}

export function createExecutionDouble(params: ExecutionDoubleParams = {}): ExecutionDouble {
  const row: ExecutionRow = {
    cancelRequestedAt: params.cancelRequestedAt,
    counters: {},
    finishedAt: undefined,
    job: params.job ?? 'fuel.price.pull',
    leaseExpiresAt: undefined,
    origin: params.origin ?? 'schedule',
    outcome: undefined,
  }
  const renewals: RenewJobExecutionLeaseParams[] = []
  let renewalFailure: Error | undefined

  return {
    failRenewals: (reason) => {
      renewalFailure = reason
    },
    renewals,
    row,

    claim(claimParams: ClaimJobExecutionParams) {
      const claimable =
        row.finishedAt === undefined &&
        (row.leaseExpiresAt === undefined ||
          row.leaseExpiresAt.getTime() <= claimParams.now.getTime())
      if (!claimable) return Promise.resolve(undefined)

      row.leaseExpiresAt = claimParams.leaseExpiresAt
      return Promise.resolve({ job: row.job, origin: row.origin })
    },

    renew(
      renewParams: RenewJobExecutionLeaseParams,
    ): Promise<RenewedJobExecutionLease | undefined> {
      renewals.push(renewParams)
      if (renewalFailure !== undefined) return Promise.reject(renewalFailure)

      const ours =
        row.finishedAt === undefined &&
        row.leaseExpiresAt?.getTime() === renewParams.expectedLeaseExpiresAt.getTime()
      if (!ours) return Promise.resolve(undefined)

      row.leaseExpiresAt = renewParams.leaseExpiresAt
      return Promise.resolve({ cancelRequestedAt: row.cancelRequestedAt })
    },

    finish(finishParams: FinishJobExecutionParams) {
      if (row.finishedAt !== undefined) return Promise.resolve()
      row.counters = finishParams.counters
      row.finishedAt = finishParams.finishedAt
      row.leaseExpiresAt = undefined
      row.outcome = finishParams.outcome
      return Promise.resolve()
    },
  }
}

export type LoggedMessage = { readonly message: string; readonly metadata: unknown }

export function createLoggerDouble(logged: LoggedMessage[]): WorkerLogger {
  return {
    debug: () => {},
    error: (message: string, metadata: unknown) => logged.push({ message, metadata }),
    info: (message: string, metadata: unknown) => logged.push({ message, metadata }),
    warn: (message: string, metadata: unknown) => logged.push({ message, metadata }),
  } as unknown as WorkerLogger
}

export type ManualScheduler = {
  readonly cancelled: () => boolean
  /** Um tique do batimento, aguardado até o fim — é onde o teste põe o que acontece entre unidades. */
  readonly beat: () => Promise<void>
  readonly milliseconds: () => number | undefined
  readonly scheduler: IntervalScheduler
}

export function createManualScheduler(): ManualScheduler {
  let callback: (() => Promise<void>) | undefined
  let milliseconds: number | undefined
  let cancelled = false

  return {
    beat: async () => {
      if (callback === undefined) throw new Error('batimento não agendado')
      await callback()
    },
    cancelled: () => cancelled,
    milliseconds: () => milliseconds,
    scheduler: (scheduled, interval) => {
      callback = scheduled
      milliseconds = interval
      return () => {
        cancelled = true
      }
    },
  }
}
