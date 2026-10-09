/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Etapa 2 da rotina (ADR-0100 §5): a busca no fornecedor, dentro do limite e do orçamento. Uma
 * requisição por par `(cidade, ano)`; o nacional, uma por ano, só para paridade; o estadual só quando
 * a resposta da cidade não o trouxe. Falha de um par fica no par — só 401/403 e 429 encerram o ciclo.
 */
import { safeLogError } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { HOLIDAY_PROVIDER_SCOPE } from '../domain/holiday-provider.constant.js'
import {
  HOLIDAY_PROVIDER_ERROR_CODE,
  HolidayProviderError,
} from '../domain/holiday-provider.error.js'
import type { FetchPair } from '../domain/holiday-fetch.types.js'
import type { ProviderHolidayEntry } from '../domain/holiday-provider.types.js'
import { mergeProviderEntries } from '../domain/holiday-provider-entry.policy.js'
import {
  buildFailureRecord,
  buildNotCoveredRecord,
  buildQuotaExhaustedRecord,
  buildRateLimitedRecord,
  resolveSuccessNextAttemptAt,
} from '../domain/holiday-fetch-record.policy.js'
import {
  FERIADOS_API_PAGE_SIZE,
  FERIADOS_API_REQUEST_SPACING_MILLISECONDS,
  HOLIDAY_PROVIDER_CYCLE_REQUEST_CEILING,
  HOLIDAY_PROVIDER_MAX_PAGES,
} from '../domain/holiday-provider-pull.constant.js'
import {
  resolveBudgetMonth,
  resolveHorizonYears,
} from '../domain/holiday-provider-schedule.policy.js'

import type { HolidayFetchStore } from './holiday-fetch.port.js'
import type { HolidayProviderClient, HolidayProviderPage } from './holiday-provider-client.port.js'
import { createRequestLimiter, type RequestClock, type RequestLimiter } from './request-limiter.js'

export type FetchTally = {
  budgetExhausted: boolean
  ceilingReached: boolean
  malformedResponses: number
  pairsFetched: number
  pairsNotCovered: number
  rateLimited: boolean
  requests: number
  unauthorized: boolean
  unexpectedFailures: number
  unreachable: number
}

export type FetchHolidayProviderDependencies = {
  /** `FERIADOS_API_MONTHLY_REQUEST_BUDGET`: o teto de requisições do mês, por instalação. */
  readonly budget: number
  readonly client: HolidayProviderClient
  readonly clock: RequestClock
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly requestCeiling?: number | undefined
  readonly spacingMilliseconds?: number | undefined
  readonly store: HolidayFetchStore
}

export type FetchHolidayProviderUseCase = {
  execute(input: {
    readonly correlationId?: string | undefined
    readonly isStopRequested: () => boolean
  }): Promise<FetchTally>
}

type HaltReason = 'budget' | 'ceiling' | 'rate_limited' | 'stop' | 'unauthorized'

type Cycle = {
  readonly ceiling: number
  readonly correlationId: string | undefined
  readonly dependencies: FetchHolidayProviderDependencies
  halt: HaltReason | undefined
  haltedPair: FetchPair | undefined
  readonly isStopRequested: () => boolean
  readonly limiter: RequestLimiter
  readonly now: Date
  readonly tally: FetchTally
}

const entryKey = (entry: ProviderHolidayEntry) => `${entry.scope}|${entry.ibgeCode}|${entry.date}`

async function requestPage(input: {
  readonly cycle: Cycle
  readonly page: number
  readonly pair: FetchPair
}): Promise<HolidayProviderPage | undefined> {
  const { cycle, page, pair } = input
  if (cycle.isStopRequested()) {
    cycle.halt = 'stop'
    return undefined
  }
  if (cycle.tally.requests >= cycle.ceiling) {
    cycle.halt = 'ceiling'
    return undefined
  }

  // O contador sobe **antes** da chamada: queda no meio dela não devolve a requisição ao orçamento.
  const granted = await cycle.dependencies.store.claimBudget({
    budget: cycle.dependencies.budget,
    month: resolveBudgetMonth(cycle.now),
  })
  if (!granted) {
    cycle.halt = 'budget'
    cycle.haltedPair = pair
    return undefined
  }

  await cycle.limiter.wait()
  cycle.tally.requests += 1
  return cycle.dependencies.client.fetchPage({
    ibgeCode: pair.ibgeCode,
    page,
    scope: pair.scope,
    year: pair.year,
  })
}

/** Página cheia pede a seguinte; para quando vem menos de 100, nada novo, ou no teto de páginas. */
async function collectEntries(input: {
  readonly cycle: Cycle
  readonly pair: FetchPair
}): Promise<readonly ProviderHolidayEntry[] | undefined> {
  const collected: ProviderHolidayEntry[] = []
  const seen = new Set<string>()

  for (let page = 1; page <= HOLIDAY_PROVIDER_MAX_PAGES; page += 1) {
    const result = await requestPage({ ...input, page })
    if (result === undefined) return undefined

    const fresh = result.entries.filter((entry) => !seen.has(entryKey(entry)))
    for (const entry of fresh) seen.add(entryKey(entry))
    collected.push(...fresh)

    const hasMore = result.receivedCount >= FERIADOS_API_PAGE_SIZE && fresh.length > 0
    if (!hasMore) break
  }

  return mergeProviderEntries(collected)
}

async function recordProviderFailure(input: {
  readonly cycle: Cycle
  readonly error: HolidayProviderError
  readonly pair: FetchPair
}): Promise<void> {
  const { cycle, error, pair } = input
  const { now, tally } = cycle
  const { store } = cycle.dependencies

  switch (error.code) {
    case HOLIDAY_PROVIDER_ERROR_CODE.UNAUTHORIZED:
      tally.unauthorized = true
      cycle.halt = 'unauthorized'
      return
    case HOLIDAY_PROVIDER_ERROR_CODE.RATE_LIMITED:
      tally.rateLimited = true
      cycle.halt = 'rate_limited'
      await store.recordFetches([
        buildRateLimitedRecord({ now, pair, retryAfterSeconds: error.retryAfterSeconds }),
      ])
      return
    case HOLIDAY_PROVIDER_ERROR_CODE.NOT_FOUND:
      tally.pairsNotCovered += 1
      await store.recordFetches([buildNotCoveredRecord({ now, pair })])
      return
    default:
      if (error.code === HOLIDAY_PROVIDER_ERROR_CODE.MALFORMED_RESPONSE) {
        tally.malformedResponses += 1
      } else {
        tally.unreachable += 1
      }
      await store.recordFetches([buildFailureRecord({ errorCode: error.code, now, pair })])
  }
}

async function storeSuccess(input: {
  readonly cycle: Cycle
  readonly entries: readonly ProviderHolidayEntry[]
  readonly pair: FetchPair
}): Promise<boolean> {
  const { cycle, entries, pair } = input
  const hasState =
    pair.scope === HOLIDAY_PROVIDER_SCOPE.CITY && entries.some((entry) => entry.scope === 'state')

  await cycle.dependencies.store.saveSuccess({
    entries,
    nextAttemptAt: resolveSuccessNextAttemptAt(cycle.now),
    now: cycle.now,
    pair,
    stateCovered: hasState ? { stateCode: pair.ibgeCode.slice(0, 2), year: pair.year } : undefined,
  })
  cycle.tally.pairsFetched += 1
  return hasState
}

async function settlePair(input: {
  readonly cycle: Cycle
  readonly pair: FetchPair
}): Promise<void> {
  const { cycle, pair } = input

  try {
    const entries = await collectEntries(input)
    if (entries === undefined) return

    const hasState = await storeSuccess({ cycle, entries, pair })
    if (pair.scope !== HOLIDAY_PROVIDER_SCOPE.CITY || hasState || cycle.halt !== undefined) return

    // A resposta da cidade não trouxe o estadual: busca o estado uma vez por UF e ano.
    const statePair = await cycle.dependencies.store.ensureStatePair({
      now: cycle.now,
      stateCode: pair.ibgeCode.slice(0, 2),
      year: pair.year,
    })
    if (statePair !== undefined) await settlePair({ cycle, pair: statePair })
  } catch (error: unknown) {
    await settleFailure({ cycle, error, pair })
  }
}

async function settleFailure(input: {
  readonly cycle: Cycle
  readonly error: unknown
  readonly pair: FetchPair
}): Promise<void> {
  const { cycle, error, pair } = input

  try {
    if (error instanceof HolidayProviderError) {
      await recordProviderFailure({ cycle, error, pair })
      return
    }
    throw error
  } catch (unexpected: unknown) {
    cycle.tally.unexpectedFailures += 1
    // O nome do erro e o par, nunca a mensagem: a do banco pode carregar o dado que falhou.
    safeLogError({
      logger: cycle.dependencies.logger,
      message: 'holiday_fetch_pair_failed',
      metadata: {
        correlationId: cycle.correlationId,
        ibgeCode: pair.ibgeCode,
        reason: unexpected instanceof Error ? unexpected.name : 'UnknownError',
        scope: pair.scope,
        year: pair.year,
      },
    })
  }
}

export function createFetchHolidayProviderUseCase(
  dependencies: FetchHolidayProviderDependencies,
): FetchHolidayProviderUseCase {
  const ceiling = dependencies.requestCeiling ?? HOLIDAY_PROVIDER_CYCLE_REQUEST_CEILING
  const limiter = createRequestLimiter({
    clock: dependencies.clock,
    spacingMilliseconds:
      dependencies.spacingMilliseconds ?? FERIADOS_API_REQUEST_SPACING_MILLISECONDS,
  })

  return {
    async execute({ correlationId, isStopRequested }) {
      const now = dependencies.now()
      const cycle: Cycle = {
        ceiling,
        correlationId,
        dependencies,
        halt: undefined,
        haltedPair: undefined,
        isStopRequested,
        limiter,
        now,
        tally: {
          budgetExhausted: false,
          ceilingReached: false,
          malformedResponses: 0,
          pairsFetched: 0,
          pairsNotCovered: 0,
          rateLimited: false,
          requests: 0,
          unauthorized: false,
          unexpectedFailures: 0,
          unreachable: 0,
        },
      }
      const pairs = await dependencies.store.listDuePairs({
        limit: ceiling,
        now,
        years: resolveHorizonYears(now),
      })

      for (const [index, pair] of pairs.entries()) {
        if (cycle.halt !== undefined) break
        await settlePair({ cycle, pair })
        if (cycle.halt === 'budget')
          await markQuotaExhausted({ cycle, remaining: pairs.slice(index + 1) })
      }

      cycle.tally.budgetExhausted = cycle.halt === 'budget'
      cycle.tally.ceilingReached = cycle.tally.requests >= ceiling
      return cycle.tally
    },
  }
}

/** Orçamento do mês atingido: o par em curso e os que sobraram esperam o dia 1º (não é falha). */
async function markQuotaExhausted(input: {
  readonly cycle: Cycle
  readonly remaining: readonly FetchPair[]
}): Promise<void> {
  const { cycle, remaining } = input
  const pairs = cycle.haltedPair === undefined ? remaining : [cycle.haltedPair, ...remaining]

  try {
    await cycle.dependencies.store.recordFetches(
      pairs.map((pair) => buildQuotaExhaustedRecord({ now: cycle.now, pair })),
    )
  } catch (error: unknown) {
    cycle.tally.unexpectedFailures += 1
    safeLogError({
      logger: cycle.dependencies.logger,
      message: 'holiday_fetch_quota_record_failed',
      metadata: {
        correlationId: cycle.correlationId,
        reason: error instanceof Error ? error.name : 'UnknownError',
      },
    })
  }
}
