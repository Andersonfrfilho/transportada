/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Etapa 2 da rotina (ADR-0100 §5): a busca no fornecedor, dentro do limite e do orçamento. Uma
 * requisição por par `(cidade, ano)`; o nacional, uma por ano, só para paridade; o estadual só quando
 * a resposta da cidade não o trouxe. Falha de um par fica no par — só 401/403 e 429 encerram o ciclo.
 */
import {
  FERIADOS_API_REQUEST_SPACING_MILLISECONDS,
  HOLIDAY_PROVIDER_CYCLE_REQUEST_CEILING,
} from '../domain/holiday-provider-pull.constant.js'
import { resolveHorizonYears } from '../domain/holiday-provider-schedule.policy.js'

import { markQuotaExhausted } from './fetch-holiday-failure.service.js'
import { settlePair } from './fetch-holiday-pair.service.js'
import type {
  Cycle,
  FetchHolidayProviderDependencies,
  FetchHolidayProviderUseCase,
  FetchTally,
} from './holiday-fetch-cycle.types.js'
import { createRequestLimiter } from './request-limiter.js'

export type {
  FetchHolidayProviderDependencies,
  FetchHolidayProviderUseCase,
  FetchTally,
} from './holiday-fetch-cycle.types.js'

function createEmptyTally(): FetchTally {
  return {
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
        tally: createEmptyTally(),
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
