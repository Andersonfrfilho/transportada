/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `holiday.provider.pull` (ADR-0100 §5): as três etapas num só ciclo — descoberta das cidades (só
 * banco), busca no fornecedor (HTTP, dentro do limite e do orçamento) e aplicação no calendário da
 * empresa (só banco). Cada etapa falha por si: a que estoura é contada e as seguintes ainda rodam,
 * porque a descoberta e a aplicação só tocam o banco e a busca retoma de onde parou. A parada pedida é
 * lida **antes** de cada etapa, nunca no meio de uma.
 *
 * Falha de fornecedor fecha com a palavra do catálogo; falha nossa fecha em `unexpected_error`, que
 * vence a do fornecedor. Orçamento do mês e teto do ciclo não são falha. Só contadores e identificadores
 * vão para o log — o token nem passa por aqui.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
import type { JobOutcome } from '../../shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'

import type { ApplyHolidayProviderUseCase, ApplyTally } from './apply-holiday-provider.use-case.js'
import type {
  DiscoverHolidayCitiesUseCase,
  DiscoveryTally,
} from './discover-holiday-cities.use-case.js'
import type { FetchHolidayProviderUseCase, FetchTally } from './fetch-holiday-provider.use-case.js'

export type HolidayProviderPullRoutineDependencies = {
  readonly apply: ApplyHolidayProviderUseCase
  readonly discover: DiscoverHolidayCitiesUseCase
  readonly fetch: FetchHolidayProviderUseCase
  readonly logger: WorkerLogger
}

type CycleState = {
  apply: ApplyTally | undefined
  discovery: DiscoveryTally | undefined
  fetch: FetchTally | undefined
  stageFailures: number
}

export function createHolidayProviderPullRoutine(
  dependencies: HolidayProviderPullRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runStage<TTally>(input: {
  readonly context: JobRoutineContext
  readonly dependencies: HolidayProviderPullRoutineDependencies
  readonly execute: () => Promise<TTally>
  readonly name: string
  readonly state: CycleState
}): Promise<TTally | undefined> {
  if (input.context.isStopRequested()) return undefined

  try {
    return await input.execute()
  } catch (error: unknown) {
    input.state.stageFailures += 1
    // O nome do erro, nunca a mensagem: a do banco ou da rede pode carregar o dado que falhou.
    safeLogError({
      logger: input.dependencies.logger,
      message: 'holiday_provider_pull_stage_failed',
      metadata: {
        correlationId: input.context.correlationId,
        executionId: input.context.executionId,
        reason: error instanceof Error ? error.name : 'UnknownError',
        stage: input.name,
      },
    })
    return undefined
  }
}

async function runStages(input: {
  readonly context: JobRoutineContext
  readonly dependencies: HolidayProviderPullRoutineDependencies
}): Promise<CycleState> {
  const { context, dependencies } = input
  const { correlationId, isStopRequested } = context
  const state: CycleState = {
    apply: undefined,
    discovery: undefined,
    fetch: undefined,
    stageFailures: 0,
  }

  state.discovery = await runStage({
    context,
    dependencies,
    execute: () => dependencies.discover.execute({ correlationId, isStopRequested }),
    name: 'discovery',
    state,
  })
  state.fetch = await runStage({
    context,
    dependencies,
    execute: () => dependencies.fetch.execute({ correlationId, isStopRequested }),
    name: 'fetch',
    state,
  })
  state.apply = await runStage({
    context,
    dependencies,
    execute: () => dependencies.apply.execute({ correlationId, isStopRequested }),
    name: 'apply',
    state,
  })

  return state
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: HolidayProviderPullRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const state = await runStages(input)
  const counters = buildCounters(state)
  const outcome = resolveOutcome(state)

  safeLogInfo({
    logger: dependencies.logger,
    message: 'holiday_provider_pull_cycle_finished',
    metadata: {
      ...counters,
      correlationId: context.correlationId,
      executionId: context.executionId,
      outcome,
    },
  })

  return { counters, outcome }
}

const flag = (value: boolean | undefined) => (value === true ? 1 : 0)

/** Zerado fica fora, menos o que o cartão do painel mostra sempre: o cartão conta o que aconteceu. */
function buildCounters(state: CycleState): Readonly<Record<string, number>> {
  const { apply, discovery, fetch } = state
  const counters: Record<string, number> = {
    discovery_batches: discovery?.batches ?? 0,
    discovery_discarded_city_codes: discovery?.discardedCityCodes ?? 0,
    discovery_documents: discovery?.documentsRead ?? 0,
    discovery_failed_companies: discovery?.failedCompanies ?? 0,
    discovery_without_destination: discovery?.documentsWithoutDestination ?? 0,
    apply_failed_companies: apply?.failedCompanies ?? 0,
    apply_unexpected_failures: apply?.unexpectedFailures ?? 0,
    budget_exhausted: flag(fetch?.budgetExhausted),
    ceiling_reached: flag(fetch?.ceilingReached),
    fetch_unexpected_failures: fetch?.unexpectedFailures ?? 0,
    malformed_response: fetch?.malformedResponses ?? 0,
    municipal_inserted: apply?.municipalInserted ?? 0,
    national_mismatch: apply?.nationalMismatch ?? 0,
    pairs_fetched: fetch?.pairsFetched ?? 0,
    pairs_not_covered: fetch?.pairsNotCovered ?? 0,
    provider_unauthorized: flag(fetch?.unauthorized),
    provider_unreachable: fetch?.unreachable ?? 0,
    rate_limited: flag(fetch?.rateLimited),
    requests: fetch?.requests ?? 0,
    stage_failures: state.stageFailures,
    state_inserted: apply?.stateInserted ?? 0,
  }
  const alwaysShown = new Set(['municipal_inserted', 'requests', 'state_inserted'])

  return Object.fromEntries(
    Object.entries(counters).filter(([name, value]) => value > 0 || alwaysShown.has(name)),
  )
}

function countOwnFailures(state: CycleState): number {
  return (
    state.stageFailures +
    (state.discovery?.failedCompanies ?? 0) +
    (state.fetch?.unexpectedFailures ?? 0) +
    (state.apply?.failedCompanies ?? 0) +
    (state.apply?.unexpectedFailures ?? 0)
  )
}

/** Falha nossa vence a do fornecedor; entre as do fornecedor, a que o usuário resolve vem primeiro. */
function resolveOutcome(state: CycleState): JobOutcome {
  if (countOwnFailures(state) > 0) return 'unexpected_error'

  const { fetch } = state
  if (fetch?.unauthorized === true) return 'provider_unauthorized'
  if ((fetch?.malformedResponses ?? 0) > 0) return 'malformed_response'
  if ((fetch?.unreachable ?? 0) > 0 || fetch?.rateLimited === true) return 'provider_unreachable'

  return 'succeeded'
}
