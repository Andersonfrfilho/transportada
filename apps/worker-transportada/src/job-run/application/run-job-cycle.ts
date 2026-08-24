/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
import type { JobRunEnvelopeV1 } from '../../messaging/job-run-envelope.schema.js'
import {
  isJobOutcome,
  type JobOutcome,
  type ScheduledJob,
} from '../../shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'

import type { JobExecutionPort } from './job-execution.port.js'
import type { JobRoutineRegistry, JobRoutineResult } from './job-routine.port.js'
import {
  DEFAULT_INTERVAL_SCHEDULER,
  startLeaseHeartbeat,
  type IntervalScheduler,
  type LeaseHeartbeat,
} from './lease-heartbeat.js'

/**
 * Trinta segundos, o mesmo do lease do outbox relay. É curto de propósito: ele não mede a duração da
 * rotina — quem o estende enquanto ela corre é a renovação —, ele mede quanto tempo uma execução de
 * processo morto fica de pé antes de a varredura poder abandoná-la.
 */
export const JOB_RUN_LEASE_SECONDS = 30

/** O pouso do imprevisto. Fora do vocabulário de qualquer rotina, e por isso serve às quatro. */
const UNEXPECTED_OUTCOME: JobOutcome = 'unexpected_error'

/** O desfecho da parada pedida pelo operador. Substitui o "terminou" de quem não terminou. */
const CANCELLED_OUTCOME: JobOutcome = 'cancelled'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

const EMPTY_COUNTERS: Readonly<Record<string, number>> = {}

export type JobCycleResult = {
  readonly claimed: boolean
  readonly outcome: JobOutcome | undefined
}

export type RunJobCycleDependencies = {
  readonly executions: JobExecutionPort
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly routines: JobRoutineRegistry
  /**
   * Só o teste passa isto. Em produção o batimento é `setInterval`, e obrigar o `main.ts` a
   * declará-lo faria a composição da runtime falar de temporizador.
   */
  readonly scheduleInterval?: IntervalScheduler
}

type RunJobCycleParams = {
  readonly dependencies: RunJobCycleDependencies
  readonly envelope: JobRunEnvelopeV1
}

export type JobCyclePort = {
  run(params: { readonly envelope: JobRunEnvelopeV1 }): Promise<JobCycleResult>
}

export function createJobCycle(dependencies: RunJobCycleDependencies): JobCyclePort {
  return { run: ({ envelope }) => runJobCycle({ dependencies, envelope }) }
}

/**
 * Abre a linha, chama a rotina, fecha a linha — e fecha **em todo caminho**, que é a razão de esta
 * spec existir: rotina ausente, rotina que estoura e código fora do vocabulário terminam em
 * `unexpected_error` com `finished_at` gravado, nunca em linha aberta para sempre.
 */
export async function runJobCycle({
  dependencies,
  envelope,
}: RunJobCycleParams): Promise<JobCycleResult> {
  const { executionId } = envelope.payload
  const startedAt = dependencies.now()

  const claimed = await dependencies.executions.claim({
    executionId,
    leaseExpiresAt: leaseFrom(startedAt),
    now: startedAt,
  })

  if (claimed === undefined) {
    // Reentrega de mensagem já processada, ou outro processo com o lease vivo. Nos dois casos não há
    // o que fazer, e recusar a mensagem só a devolveria para o mesmo lugar.
    safeLogInfo({
      logger: dependencies.logger,
      message: 'job_run_execution_not_claimable',
      metadata: { correlationId: envelope.correlationId, executionId },
    })
    return { claimed: false, outcome: undefined }
  }

  const { job, origin } = claimed
  const metadata = { correlationId: envelope.correlationId, executionId, job, origin }
  const routine = dependencies.routines[job]

  if (routine === undefined) {
    safeLogError({
      logger: dependencies.logger,
      message: 'job_run_routine_missing',
      metadata,
    })
    return finish({
      counters: EMPTY_COUNTERS,
      dependencies,
      executionId,
      outcome: UNEXPECTED_OUTCOME,
    })
  }

  const heartbeat = startLeaseHeartbeat({
    executionId,
    executions: dependencies.executions,
    leaseExpiresAt: leaseFrom(startedAt),
    leaseSeconds: JOB_RUN_LEASE_SECONDS,
    logger: dependencies.logger,
    metadata,
    now: dependencies.now,
    schedule: dependencies.scheduleInterval ?? DEFAULT_INTERVAL_SCHEDULER,
  })

  let result: JobRoutineResult
  try {
    result = await routine.run({
      correlationId: envelope.correlationId,
      executionId,
      isStopRequested: () => heartbeat.isStopRequested(),
      job,
      origin,
    })
  } catch (error: unknown) {
    safeLogError({
      logger: dependencies.logger,
      message: 'job_run_routine_failed',
      metadata: { ...metadata, reason: error instanceof Error ? error.name : 'UnknownError' },
    })
    return finish({
      counters: EMPTY_COUNTERS,
      dependencies,
      executionId,
      outcome: UNEXPECTED_OUTCOME,
    })
  } finally {
    heartbeat.stop()
  }

  const outcome = resolveOutcome({ dependencies, heartbeat, job, metadata, result })

  return finish({ counters: result.counters, dependencies, executionId, outcome })
}

function leaseFrom(instant: Date): Date {
  return new Date(instant.getTime() + JOB_RUN_LEASE_SECONDS * 1000)
}

type ResolveOutcomeParams = {
  readonly dependencies: RunJobCycleDependencies
  readonly heartbeat: LeaseHeartbeat
  readonly job: ScheduledJob
  readonly metadata: Readonly<Record<string, string>>
  readonly result: JobRoutineResult
}

function resolveOutcome({
  dependencies,
  heartbeat,
  job,
  metadata,
  result,
}: ResolveOutcomeParams): JobOutcome {
  if (!isJobOutcome({ job, outcome: result.outcome })) {
    // Os contadores ficam: o trabalho aconteceu, e é o código que não tem nome ainda.
    safeLogError({
      logger: dependencies.logger,
      message: 'job_run_outcome_unknown',
      metadata: { ...metadata, outcome: result.outcome },
    })
    return UNEXPECTED_OUTCOME
  }

  if (heartbeat.isLeaseLost()) {
    // A linha já não é nossa: o `finish` condicional vai recusar a escrita, e é a varredura quem
    // gravou `abandoned`. Inventar um desfecho aqui só criaria discórdia entre o log e a tela.
    return result.outcome
  }

  if (!heartbeat.isStopRequested() || result.outcome !== COMPLETED_OUTCOME) {
    // Parada não apaga falha: a rotina que já tinha um motivo guarda o motivo. O que a parada
    // substitui é o "terminou" de quem largou o resto pelo caminho.
    return result.outcome
  }

  safeLogInfo({
    logger: dependencies.logger,
    message: 'job_run_cycle_cancelled',
    metadata,
  })
  return CANCELLED_OUTCOME
}

type FinishParams = {
  readonly counters: Readonly<Record<string, number>>
  readonly dependencies: RunJobCycleDependencies
  readonly executionId: string
  readonly outcome: JobOutcome
}

async function finish({
  counters,
  dependencies,
  executionId,
  outcome,
}: FinishParams): Promise<JobCycleResult> {
  await dependencies.executions.finish({
    counters,
    executionId,
    finishedAt: dependencies.now(),
    outcome,
  })

  return { claimed: true, outcome }
}
