/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Um par `(escopo, código, ano)` da busca: pede as páginas, grava o sucesso ou o desfecho da falha.
 */
import { safeLogError } from '../../logging/safe-logger.service.js'
import { HOLIDAY_PROVIDER_SCOPE } from '../domain/holiday-provider.constant.js'
import { HolidayProviderError } from '../domain/holiday-provider.error.js'
import type { FetchPair } from '../domain/holiday-fetch.types.js'
import type { ProviderHolidayEntry } from '../domain/holiday-provider.types.js'
import { mergeProviderEntries } from '../domain/holiday-provider-entry.policy.js'
import { resolveSuccessNextAttemptAt } from '../domain/holiday-fetch-record.policy.js'
import {
  FERIADOS_API_PAGE_SIZE,
  HOLIDAY_PROVIDER_MAX_PAGES,
} from '../domain/holiday-provider-pull.constant.js'
import { resolveBudgetMonth } from '../domain/holiday-provider-schedule.policy.js'

import { recordProviderFailure } from './fetch-holiday-failure.service.js'
import type { Cycle } from './holiday-fetch-cycle.types.js'
import type { HolidayProviderPage } from './holiday-provider-client.port.js'

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

export async function settlePair(input: {
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
