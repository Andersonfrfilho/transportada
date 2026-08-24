/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
import type { JobRunEnvelopeV1 } from '../../messaging/job-run-envelope.schema.js'
import { isJobOutcome, type JobOutcome } from '../../shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'

import type { JobExecutionPort } from './job-execution.port.js'
import type { JobRoutineRegistry, JobRoutineResult } from './job-routine.port.js'

/**
 * Trinta segundos, o mesmo do lease do outbox relay. É curto de propósito: ele não mede a duração da
 * rotina — quem o estende enquanto ela corre é a renovação —, ele mede quanto tempo uma execução de
 * processo morto fica de pé antes de a varredura poder abandoná-la.
 */
export const JOB_RUN_LEASE_SECONDS = 30

/** O pouso do imprevisto. Fora do vocabulário de qualquer rotina, e por isso serve às quatro. */
const UNEXPECTED_OUTCOME: JobOutcome = 'unexpected_error'

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
    leaseExpiresAt: new Date(startedAt.getTime() + JOB_RUN_LEASE_SECONDS * 1000),
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

  let result: JobRoutineResult
  try {
    result = await routine.run({ correlationId: envelope.correlationId, executionId, job, origin })
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
  }

  const outcome = isJobOutcome({ job, outcome: result.outcome })
    ? result.outcome
    : UNEXPECTED_OUTCOME

  if (outcome !== result.outcome) {
    // Os contadores ficam: o trabalho aconteceu, e é o código que não tem nome ainda.
    safeLogError({
      logger: dependencies.logger,
      message: 'job_run_outcome_unknown',
      metadata: { ...metadata, outcome: result.outcome },
    })
  }

  return finish({ counters: result.counters, dependencies, executionId, outcome })
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
