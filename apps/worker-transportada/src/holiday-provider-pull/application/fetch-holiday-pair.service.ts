/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Um par `(escopo, código, ano)` da busca: pede as páginas, grava o sucesso ou o desfecho da falha.
 */
import { safeLogError } from '../../logging/safe-logger.service.js'
import type { FetchPair } from '../domain/holiday-fetch.types.js'
import { resolveSuccessNextAttemptAt } from '../domain/holiday-fetch-record.policy.js'
import { HOLIDAY_PROVIDER_SCOPE } from '../domain/holiday-provider.constant.js'
import { HolidayProviderError } from '../domain/holiday-provider.error.js'
import type { ProviderHolidayEntry } from '../domain/holiday-provider.types.js'
import { mergeProviderEntries } from '../domain/holiday-provider-entry.policy.js'
import {
  FERIADOS_API_PAGE_SIZE,
  HOLIDAY_PROVIDER_MAX_PAGES,
} from '../domain/holiday-provider-pull.constant.js'
import { resolveBudgetMonth } from '../domain/holiday-provider-schedule.policy.js'

import { recordPersistenceFailure, recordProviderFailure } from './fetch-holiday-failure.service.js'
import type { Cycle } from './holiday-fetch-cycle.types.js'
import type { HolidayProviderPage } from './holiday-provider-client.port.js'

const entryKey = (entry: ProviderHolidayEntry) => `${entry.scope}|${entry.ibgeCode}|${entry.date}`

/**
 * Antes de cada requisição: parada do operador, teto do ciclo, o limitador e só então o orçamento do
 * mês — o contador sobe **imediatamente antes** da chamada (atômico, no banco), de modo que só a queda
 * do processo entre o incremento e o envio gasta uma requisição que não saiu. Escolha simples e
 * conservadora: nunca subestima o que foi gasto.
 */
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

  await cycle.limiter.wait()
  const granted = await cycle.dependencies.store.claimBudget({
    budget: cycle.dependencies.budget,
    month: resolveBudgetMonth(cycle.now),
  })
  if (!granted) {
    cycle.halt = 'budget'
    return undefined
  }

  cycle.tally.requests += 1
  const result = await cycle.dependencies.client.fetchPage({
    ibgeCode: pair.ibgeCode,
    page,
    scope: pair.scope,
    year: pair.year,
  })
  cycle.consecutiveUnreachable = 0
  return result
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

    input.cycle.tally.entriesDiscarded += result.discardedCount ?? 0
    const fresh = result.entries.filter((entry) => !seen.has(entryKey(entry)))
    for (const entry of fresh) seen.add(entryKey(entry))
    collected.push(...fresh)

    const hasMore = result.receivedCount >= FERIADOS_API_PAGE_SIZE && fresh.length > 0
    if (!hasMore) break
  }

  return mergeProviderEntries(collected)
}

/** Se a gravação falha depois de uma resposta boa, o par recua em comando à parte e o erro segue para a contagem. */
async function storeSuccess(input: {
  readonly cycle: Cycle
  readonly entries: readonly ProviderHolidayEntry[]
  readonly pair: FetchPair
}): Promise<boolean> {
  const { cycle, entries, pair } = input
  const hasState =
    pair.scope === HOLIDAY_PROVIDER_SCOPE.CITY &&
    entries.some((entry) => entry.scope === HOLIDAY_PROVIDER_SCOPE.STATE)

  try {
    await cycle.dependencies.store.saveSuccess({
      entries,
      nextAttemptAt: resolveSuccessNextAttemptAt(cycle.now),
      now: cycle.now,
      pair,
      stateCovered: hasState
        ? { stateCode: pair.ibgeCode.slice(0, 2), year: pair.year }
        : undefined,
    })
  } catch (error: unknown) {
    await recordPersistenceFailure({ cycle, pair })
    throw error
  }
  cycle.tally.pairsFetched += 1
  return hasState
}

/** A fila do estado falhar é falha do ESTADO, não da cidade que a pediu: o log leva o par certo. */
async function ensureStatePair(input: {
  readonly cycle: Cycle
  readonly pair: FetchPair
}): Promise<FetchPair | undefined> {
  const { cycle, pair } = input
  const statePair: FetchPair = {
    attempts: 0,
    ibgeCode: pair.ibgeCode.slice(0, 2),
    scope: HOLIDAY_PROVIDER_SCOPE.STATE,
    year: pair.year,
  }

  try {
    return await cycle.dependencies.store.ensureStatePair({
      now: cycle.now,
      stateCode: statePair.ibgeCode,
      year: statePair.year,
    })
  } catch (error: unknown) {
    await settleFailure({ cycle, error, pair: statePair })
    return undefined
  }
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
    const statePair = await ensureStatePair({ cycle, pair })
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
