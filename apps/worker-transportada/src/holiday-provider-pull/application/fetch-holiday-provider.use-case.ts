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
    allNotFound: false,
    budgetExhausted: false,
    ceilingReached: false,
    circuitOpened: false,
    entriesDiscarded: 0,
    malformedResponses: 0,
    notFoundResponses: 0,
    pairsFetched: 0,
    pairsNotCovered: 0,
    planRestricted: 0,
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
        consecutiveUnreachable: 0,
        correlationId,
        dependencies,
        halt: undefined,
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

      for (const pair of pairs) {
        if (cycle.halt !== undefined) break
        await settlePair({ cycle, pair })
      }

      // Orçamento do mês atingido só encerra o ciclo: nenhum par muda, para que aumentar o orçamento solte tudo.
      cycle.tally.budgetExhausted = cycle.halt === 'budget'
      cycle.tally.ceilingReached = cycle.tally.requests >= ceiling
      cycle.tally.allNotFound =
        cycle.tally.requests > 0 && cycle.tally.notFoundResponses === cycle.tally.requests
      return cycle.tally
    },
  }
}
