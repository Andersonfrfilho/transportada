/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O desfecho da falha de um par: o que cada código do fornecedor grava na fila e se o ciclo para.
 * Falha de um par fica no par — só 401, 429, o contrato quebrado (404 no nacional ou no estado, 402/403
 * fora de cidade) e o disjuntor encerram o ciclo.
 */
import { safeLogError, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { FetchPair } from '../domain/holiday-fetch.types.js'
import {
  buildFailureRecord,
  buildNotCoveredRecord,
  buildPlanRestrictedRecord,
  buildRateLimitedRecord,
} from '../domain/holiday-fetch-record.policy.js'
import { HOLIDAY_PROVIDER_SCOPE } from '../domain/holiday-provider.constant.js'
import {
  HOLIDAY_PROVIDER_ERROR_CODE,
  type HolidayProviderError,
} from '../domain/holiday-provider.error.js'
import { HOLIDAY_PROVIDER_MAX_CONSECUTIVE_UNREACHABLE } from '../domain/holiday-provider-pull.constant.js'

import type { Cycle } from './holiday-fetch-cycle.types.js'

type FailureParams = {
  readonly cycle: Cycle
  readonly error: HolidayProviderError
  readonly pair: FetchPair
}

/** 404 numa cidade é "sem cobertura"; no nacional ou no estado é o caminho que mudou — contrato quebrado. */
async function recordNotFound({ cycle, pair }: FailureParams): Promise<void> {
  const { now, tally } = cycle
  tally.notFoundResponses += 1

  if (pair.scope === HOLIDAY_PROVIDER_SCOPE.CITY) {
    tally.pairsNotCovered += 1
    await cycle.dependencies.store.recordFetches([buildNotCoveredRecord({ now, pair })])
    return
  }

  tally.malformedResponses += 1
  cycle.halt = 'contract'
  await cycle.dependencies.store.recordFetches([
    buildFailureRecord({ errorCode: HOLIDAY_PROVIDER_ERROR_CODE.MALFORMED_RESPONSE, now, pair }),
  ])
}

/** 402/403: numa cidade o plano não a cobre e o ciclo segue; no nacional ou no estado, nada mais funciona. */
async function recordPlanRestricted({ cycle, pair }: FailureParams): Promise<void> {
  if (pair.scope !== HOLIDAY_PROVIDER_SCOPE.CITY) {
    cycle.tally.unauthorized = true
    cycle.halt = 'unauthorized'
    return
  }

  cycle.tally.planRestricted += 1
  await cycle.dependencies.store.recordFetches([
    buildPlanRestrictedRecord({ now: cycle.now, pair }),
  ])
}

/** Três falhas de rede seguidas abrem o disjuntor: o fornecedor está fora, e insistir só gasta orçamento. */
async function recordUnreachableOrMalformed({ cycle, error, pair }: FailureParams): Promise<void> {
  const { now, tally } = cycle

  if (error.code === HOLIDAY_PROVIDER_ERROR_CODE.MALFORMED_RESPONSE) {
    tally.malformedResponses += 1
  } else {
    tally.unreachable += 1
    cycle.consecutiveUnreachable += 1
    if (cycle.consecutiveUnreachable >= HOLIDAY_PROVIDER_MAX_CONSECUTIVE_UNREACHABLE) {
      tally.circuitOpened = true
      cycle.halt = 'circuit'
    }
  }
  await cycle.dependencies.store.recordFetches([
    buildFailureRecord({ errorCode: error.code, now, pair }),
  ])
}

export async function recordProviderFailure(input: FailureParams): Promise<void> {
  const { cycle, error, pair } = input
  if (error.code !== HOLIDAY_PROVIDER_ERROR_CODE.UNREACHABLE) cycle.consecutiveUnreachable = 0

  // Só o código e o nome do erro de transporte: nunca texto que o fornecedor ou a rede mandou.
  safeLogWarn({
    logger: cycle.dependencies.logger,
    message: 'holiday_fetch_pair_provider_failure',
    metadata: {
      code: error.code,
      correlationId: cycle.correlationId,
      ibgeCode: pair.ibgeCode,
      reason: error.reason,
      scope: pair.scope,
      year: pair.year,
    },
  })

  switch (error.code) {
    case HOLIDAY_PROVIDER_ERROR_CODE.UNAUTHORIZED:
      cycle.tally.unauthorized = true
      cycle.halt = 'unauthorized'
      return
    case HOLIDAY_PROVIDER_ERROR_CODE.PLAN_RESTRICTED:
      return recordPlanRestricted(input)
    case HOLIDAY_PROVIDER_ERROR_CODE.RATE_LIMITED:
      cycle.tally.rateLimited = true
      cycle.halt = 'rate_limited'
      await cycle.dependencies.store.recordFetches([
        buildRateLimitedRecord({
          now: cycle.now,
          pair,
          retryAfterSeconds: error.retryAfterSeconds,
        }),
      ])
      return
    case HOLIDAY_PROVIDER_ERROR_CODE.NOT_FOUND:
      return recordNotFound(input)
    default:
      return recordUnreachableOrMalformed(input)
  }
}

/**
 * A resposta era boa e foi a gravação que falhou (dado que o banco recusa, por exemplo): o par fica
 * `failed` com recuo, em comando à parte, para a requisição não se repetir todo dia. Se nem isso
 * grava, o erro vai para o log e o par volta amanhã.
 */
export async function recordPersistenceFailure(input: {
  readonly cycle: Cycle
  readonly pair: FetchPair
}): Promise<void> {
  const { cycle, pair } = input

  try {
    await cycle.dependencies.store.recordFetches([
      buildFailureRecord({ errorCode: 'persistence_failed', now: cycle.now, pair }),
    ])
  } catch (error: unknown) {
    safeLogError({
      logger: cycle.dependencies.logger,
      message: 'holiday_fetch_persistence_record_failed',
      metadata: {
        correlationId: cycle.correlationId,
        ibgeCode: pair.ibgeCode,
        reason: error instanceof Error ? error.name : 'UnknownError',
        scope: pair.scope,
        year: pair.year,
      },
    })
  }
}
