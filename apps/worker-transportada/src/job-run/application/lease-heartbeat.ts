/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'

import type { JobExecutionPort } from './job-execution.port.js'

/**
 * Um terço do lease. Duas renovações podem falhar por queda de rede antes de a linha ficar
 * abandonável — e a terceira, se também falhar, é sinal de que o processo já não alcança o banco,
 * que é exatamente quando a varredura deve poder assumir.
 */
export const JOB_RUN_LEASE_RENEWAL_SECONDS = 10

/**
 * O relógio do batimento entra por dependência porque é o único jeito de o teste provar o que
 * acontece **entre** duas unidades sem esperar dez segundos de verdade.
 */
export type IntervalScheduler = (callback: () => Promise<void>, milliseconds: number) => () => void

export const DEFAULT_INTERVAL_SCHEDULER: IntervalScheduler = (callback, milliseconds) => {
  const handle = setInterval(() => void callback(), milliseconds)
  return () => clearInterval(handle)
}

export type LeaseHeartbeat = {
  /** A linha deixou de ser nossa. O ciclo para, e o desfecho dele já não é o que vale. */
  isLeaseLost(): boolean
  /** Parada pedida pelo operador, ou lease perdido. A rotina lê isto no limite de unidade. */
  isStopRequested(): boolean
  stop(): void
}

export type StartLeaseHeartbeatParams = {
  readonly executionId: string
  readonly executions: JobExecutionPort
  readonly leaseExpiresAt: Date
  readonly leaseSeconds: number
  readonly logger: WorkerLogger
  readonly metadata: Readonly<Record<string, string>>
  readonly now: () => Date
  readonly schedule: IntervalScheduler
}

/**
 * Enquanto a rotina corre, isto estende o lease e relê `cancel_requested_at` — as duas coisas na
 * mesma escrita condicional, porque são a mesma linha. É o que separa "o processo morreu" de "a
 * rotina demora": sem renovação, toda rotina mais lenta que o lease seria abandonada viva.
 */
export function startLeaseHeartbeat(params: StartLeaseHeartbeatParams): LeaseHeartbeat {
  let leaseExpiresAt = params.leaseExpiresAt
  let cancelRequested = false
  let leaseLost = false
  let renewing = false
  let stopped = false

  async function renew(): Promise<void> {
    // Batimento que alcança o anterior ainda em voo não empilha ida ao banco: o próximo tique tenta.
    if (renewing || leaseLost || stopped) return
    renewing = true

    try {
      const next = new Date(params.now().getTime() + params.leaseSeconds * 1000)
      const renewed = await params.executions.renew({
        executionId: params.executionId,
        expectedLeaseExpiresAt: leaseExpiresAt,
        leaseExpiresAt: next,
      })

      if (renewed === undefined) {
        leaseLost = true
        safeLogError({
          logger: params.logger,
          message: 'job_run_lease_lost',
          metadata: params.metadata,
        })
        return
      }

      leaseExpiresAt = next
      if (renewed.cancelRequestedAt !== undefined) cancelRequested = true
    } catch (error: unknown) {
      // Queda de banco não derruba a rotina em curso: se ela persistir, o lease vence sozinho e a
      // varredura assume a linha — que é o desfecho correto para um processo que perdeu o banco.
      safeLogError({
        logger: params.logger,
        message: 'job_run_lease_renewal_failed',
        metadata: {
          ...params.metadata,
          reason: error instanceof Error ? error.name : 'UnknownError',
        },
      })
    } finally {
      renewing = false
    }
  }

  const cancelSchedule = params.schedule(renew, JOB_RUN_LEASE_RENEWAL_SECONDS * 1000)

  return {
    isLeaseLost: () => leaseLost,
    isStopRequested: () => cancelRequested || leaseLost,
    stop: () => {
      if (stopped) return
      stopped = true
      cancelSchedule()
    },
  }
}
