/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
import type { JobOutcome } from '../../shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { DISTRIBUTION_INELIGIBILITY_REASONS } from '../domain/distribution-eligibility.policy.js'
import { DISTRIBUTION_CADENCE_MINUTES } from '../domain/distribution-idempotency.policy.js'

import {
  enqueueDistribution,
  type EnqueueDistributionDependencies,
} from './enqueue-distribution.use-case.js'
import type { DistributionCandidateSourcePort } from './select-eligible-companies.port.js'
import {
  selectEligibleCompanies,
  type DistributionIneligibleCounts,
  type EligibleCompany,
} from './select-eligible-companies.use-case.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

const UNEXPECTED_OUTCOME: JobOutcome = 'unexpected_error'

export type NfeDistributionPullRoutineDependencies = Omit<
  EnqueueDistributionDependencies,
  'cadenceMinutes'
> & {
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly source: DistributionCandidateSourcePort
}

type CycleTally = {
  enqueuedCount: number
  failedCount: number
  skippedCount: number
}

/**
 * A rotina não fala com a SEFAZ: ela escolhe as empresas de janela aberta e grava a importação mais o
 * evento no outbox, e é o consumidor de `nfe-distribution.v1` que puxa o NSU. Isso é o que faz o
 * limite da SEFAZ continuar valendo — a espera vive em `nfe_distribution_cursors.next_allowed_at`, que
 * a elegibilidade lê antes de qualquer chamada.
 *
 * Não há advisory lock aqui, ao contrário do ciclo que o cron rodava: a linha de `job_executions`, a
 * unique de execução aberta e o lease já serializam o ciclo, e um segundo trinco só diria a mesma
 * coisa mais tarde.
 */
export function createNfeDistributionPullRoutine(
  dependencies: NfeDistributionPullRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

type RunCycleParams = {
  readonly context: JobRoutineContext
  readonly dependencies: NfeDistributionPullRoutineDependencies
}

async function runCycle({ context, dependencies }: RunCycleParams): Promise<JobRoutineResult> {
  const { eligible, ineligibleCounts } = await selectEligibleCompanies({
    logger: dependencies.logger,
    now: dependencies.now,
    source: dependencies.source,
  })

  const tally = await enqueueEligibleCompanies({ context, dependencies, eligible })

  safeLogInfo({
    logger: dependencies.logger,
    message: 'nfe_distribution_pull_cycle_finished',
    metadata: {
      correlationId: context.correlationId,
      eligibleCount: eligible.length,
      enqueuedCount: tally.enqueuedCount,
      executionId: context.executionId,
      failedCount: tally.failedCount,
      skippedCount: tally.skippedCount,
    },
  })

  return {
    counters: buildCounters({ eligibleCount: eligible.length, ineligibleCounts, tally }),
    outcome: resolveOutcome({ context, ineligibleCounts, tally }),
  }
}

type EnqueueEligibleCompaniesParams = {
  readonly context: JobRoutineContext
  readonly dependencies: NfeDistributionPullRoutineDependencies
  readonly eligible: readonly EligibleCompany[]
}

async function enqueueEligibleCompanies({
  context,
  dependencies,
  eligible,
}: EnqueueEligibleCompaniesParams): Promise<CycleTally> {
  const tally: CycleTally = { enqueuedCount: 0, failedCount: 0, skippedCount: 0 }

  for (const company of eligible) {
    // Lido entre duas empresas, nunca no meio de uma: o que a anterior gravou fica gravado.
    if (context.isStopRequested()) return tally
    await enqueueOne({ company, context, dependencies, tally })
  }

  return tally
}

type EnqueueOneParams = {
  readonly company: EligibleCompany
  readonly context: JobRoutineContext
  readonly dependencies: NfeDistributionPullRoutineDependencies
  readonly tally: CycleTally
}

async function enqueueOne({
  company,
  context,
  dependencies,
  tally,
}: EnqueueOneParams): Promise<void> {
  try {
    const result = await enqueueDistribution(
      {
        cadenceMinutes: DISTRIBUTION_CADENCE_MINUTES,
        gateway: dependencies.gateway,
        identifiers: dependencies.identifiers,
      },
      {
        companyId: company.companyId,
        correlationId: context.correlationId,
        cycleInstant: dependencies.now(),
        environment: company.environment,
      },
    )

    if (result.enqueued) tally.enqueuedCount += 1
    else tally.skippedCount += 1
  } catch (error: unknown) {
    tally.failedCount += 1
    safeLogError({
      logger: dependencies.logger,
      message: 'nfe_distribution_pull_company_enqueue_failed',
      metadata: {
        companyId: company.companyId,
        correlationId: context.correlationId,
        reason: error instanceof Error ? error.name : 'UnknownError',
      },
    })
  }
}

type BuildCountersParams = {
  readonly eligibleCount: number
  readonly ineligibleCounts: DistributionIneligibleCounts
  readonly tally: CycleTally
}

function buildCounters({
  eligibleCount,
  ineligibleCounts,
  tally,
}: BuildCountersParams): Readonly<Record<string, number>> {
  const counters: Record<string, number> = {
    eligible: eligibleCount,
    enqueued: tally.enqueuedCount,
    failed: tally.failedCount,
    skipped: tally.skippedCount,
  }

  // Razão zerada fica fora: o cartão do painel mostra o que aconteceu, não a lista de tudo que não.
  for (const reason of DISTRIBUTION_INELIGIBILITY_REASONS) {
    if (ineligibleCounts[reason] > 0) counters[reason] = ineligibleCounts[reason]
  }

  return counters
}

type ResolveOutcomeParams = {
  readonly context: JobRoutineContext
  readonly ineligibleCounts: DistributionIneligibleCounts
  readonly tally: CycleTally
}

/**
 * O código é o da elegibilidade, e o desempate é a **ordem de declaração** dela: o operador precisa
 * ver `certificate_expired` antes de `cooldown_active`, que é o repouso normal da rotina. Ciclo com
 * trabalho feito é `succeeded` mesmo que outra empresa tenha ficado de fora — o contador diz quantas.
 */
function resolveOutcome({ context, ineligibleCounts, tally }: ResolveOutcomeParams): JobOutcome {
  if (tally.failedCount > 0) return UNEXPECTED_OUTCOME

  // Parada pedida vira `cancelled` no invólucro, e só de cima de um `succeeded`.
  if (context.isStopRequested()) return COMPLETED_OUTCOME

  if (tally.enqueuedCount > 0 || tally.skippedCount > 0) return COMPLETED_OUTCOME

  for (const reason of DISTRIBUTION_INELIGIBILITY_REASONS) {
    if (ineligibleCounts[reason] > 0) return reason
  }

  return COMPLETED_OUTCOME
}
