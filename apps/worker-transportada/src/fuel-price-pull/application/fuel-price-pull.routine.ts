/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As duas metades do preço cabem na mesma rotina de propósito: uma janela, uma linha de execução.
 * Duas rotinas dariam duas chances de a mesma instalação colher metade do preço.
 *
 * Cada metade falha por si — o litro coletado não é descartado porque o kWh não veio, e vice-versa —,
 * mas a **linha fecha na falha**, não em `succeeded`: era assim no cron, onde a metade perdida virava
 * uma linha de log que ninguém lia, e é isso que a spec 052 veio consertar.
 *
 * Não há advisory lock aqui, ao contrário do ciclo que o cron rodava: a linha de `job_executions`, a
 * unique de execução aberta e o lease já serializam o ciclo, como em `nfse.status.pull`.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogError, safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { JobOutcome } from '../../shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  classifyAneelFailure,
  classifyAnpFailure,
  FUEL_PRICE_PULL_FAILURE_OUTCOMES,
  toFuelPricePullFailureOutcome,
  type FuelPricePullFailureCause,
  type FuelPricePullFailureOutcome,
} from '../domain/fuel-price-pull-failure.policy.js'

import type { PullEnergyTariffUseCase } from './pull-energy-tariff.use-case.js'
import type { PullFuelReferenceUseCase } from './pull-fuel-reference.use-case.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

const UNEXPECTED_OUTCOME: JobOutcome = 'unexpected_error'

export type FuelPricePullRoutineDependencies = {
  readonly energyUseCase: PullEnergyTariffUseCase
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly pullUseCase: PullFuelReferenceUseCase
}

type CycleTally = {
  readonly failureOutcomes: Record<FuelPricePullFailureOutcome, number>
  discardedRows: number
  eligibleCount: number
  failedCount: number
  skippedCount: number
  writtenCount: number
}

export function createFuelPricePullRoutine(
  dependencies: FuelPricePullRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

type RunCycleParams = {
  readonly context: JobRoutineContext
  readonly dependencies: FuelPricePullRoutineDependencies
}

async function runCycle({ context, dependencies }: RunCycleParams): Promise<JobRoutineResult> {
  const tally: CycleTally = {
    discardedRows: 0,
    eligibleCount: 0,
    failedCount: 0,
    failureOutcomes: createEmptyFailureOutcomeCounts(),
    skippedCount: 0,
    writtenCount: 0,
  }

  await collectWeeklyReference({ context, dependencies, tally })
  // Lido entre as duas metades: parar no meio de uma deixaria a semana gravada pela metade.
  if (!context.isStopRequested()) await collectEnergyTariff({ context, dependencies, tally })

  safeLogInfo({
    logger: dependencies.logger,
    message: 'fuel_price_pull_cycle_finished',
    metadata: {
      correlationId: context.correlationId,
      eligibleCount: tally.eligibleCount,
      executionId: context.executionId,
      failedCount: tally.failedCount,
      skippedCount: tally.skippedCount,
      writtenCount: tally.writtenCount,
    },
  })

  return { counters: buildCounters(tally), outcome: resolveOutcome({ context, tally }) }
}

type CollectParams = {
  readonly context: JobRoutineContext
  readonly dependencies: FuelPricePullRoutineDependencies
  readonly tally: CycleTally
}

async function collectWeeklyReference({
  context,
  dependencies,
  tally,
}: CollectParams): Promise<void> {
  try {
    const pull = await dependencies.pullUseCase.execute({ now: dependencies.now() })
    tally.discardedRows += pull.discardedRows
    tally.eligibleCount += pull.referenceCount
    tally.skippedCount += pull.skippedCount
    tally.writtenCount += pull.insertedCount
  } catch (error: unknown) {
    recordFailure({
      cause: classifyAnpFailure(error),
      context,
      dependencies,
      error,
      message: 'fuel_price_pull_reference_failed',
      tally,
    })
  }
}

async function collectEnergyTariff({ context, dependencies, tally }: CollectParams): Promise<void> {
  try {
    const pull = await dependencies.energyUseCase.execute({ now: dependencies.now() })
    tally.discardedRows += pull.discardedRows
    tally.eligibleCount += pull.tariffCount
    tally.writtenCount += pull.writtenCount

    // A agência respondeu, e respondeu nada: sem nome próprio, semanas sem tarifa passariam por sucesso.
    if (pull.tariffCount === 0) {
      recordCause({ cause: 'aneel_empty_slice', context, dependencies, tally })
    }
  } catch (error: unknown) {
    recordFailure({
      cause: classifyAneelFailure(error),
      context,
      dependencies,
      error,
      message: 'fuel_price_pull_tariff_failed',
      tally,
    })
  }
}

type RecordFailureParams = CollectParams & {
  readonly cause: FuelPricePullFailureCause | undefined
  readonly error: unknown
  readonly message: string
}

function recordFailure({
  cause,
  context,
  dependencies,
  error,
  message,
  tally,
}: RecordFailureParams): void {
  if (cause !== undefined) {
    recordCause({ cause, context, dependencies, tally })
    return
  }

  // Sem causa conhecida a falha é nossa, e `unexpected_error` é o lugar dela.
  tally.failedCount += 1
  safeLogError({
    logger: dependencies.logger,
    message,
    metadata: {
      correlationId: context.correlationId,
      executionId: context.executionId,
      reason: error instanceof Error ? error.name : 'UnknownError',
    },
  })
}

type RecordCauseParams = CollectParams & { readonly cause: FuelPricePullFailureCause }

function recordCause({ cause, context, dependencies, tally }: RecordCauseParams): void {
  tally.failureOutcomes[toFuelPricePullFailureOutcome(cause)] += 1
  safeLogWarn({
    logger: dependencies.logger,
    message: 'fuel_price_pull_half_deferred',
    metadata: { cause, correlationId: context.correlationId, executionId: context.executionId },
  })
}

function createEmptyFailureOutcomeCounts(): Record<FuelPricePullFailureOutcome, number> {
  const counts = {} as Record<FuelPricePullFailureOutcome, number>
  for (const outcome of FUEL_PRICE_PULL_FAILURE_OUTCOMES) counts[outcome] = 0
  return counts
}

/** Zerado fica fora: o cartão do painel mostra o que aconteceu, não a lista de tudo que não. */
function buildCounters(tally: CycleTally): Readonly<Record<string, number>> {
  const counters: Record<string, number> = {
    eligible: tally.eligibleCount,
    failed: tally.failedCount,
    skipped: tally.skippedCount,
    written: tally.writtenCount,
  }

  if (tally.discardedRows > 0) counters.discarded_rows = tally.discardedRows

  for (const outcome of FUEL_PRICE_PULL_FAILURE_OUTCOMES) {
    if (tally.failureOutcomes[outcome] > 0) counters[outcome] = tally.failureOutcomes[outcome]
  }

  return counters
}

type ResolveOutcomeParams = {
  readonly context: JobRoutineContext
  readonly tally: CycleTally
}

/**
 * Ao contrário de `nfse.status.pull`, metade escrita **não** vence metade falhada: são duas coletas
 * independentes, e fechar em `succeeded` porque o litro veio esconderia o kWh que ninguém colheu.
 * O desempate é a ordem de declaração de `FUEL_PRICE_PULL_FAILURE_OUTCOMES`.
 */
function resolveOutcome({ context, tally }: ResolveOutcomeParams): JobOutcome {
  if (tally.failedCount > 0) return UNEXPECTED_OUTCOME

  // Parada pedida vira `cancelled` no invólucro, e só de cima de um `succeeded`.
  if (context.isStopRequested()) return COMPLETED_OUTCOME

  for (const outcome of FUEL_PRICE_PULL_FAILURE_OUTCOMES) {
    if (tally.failureOutcomes[outcome] > 0) return outcome
  }

  return COMPLETED_OUTCOME
}
