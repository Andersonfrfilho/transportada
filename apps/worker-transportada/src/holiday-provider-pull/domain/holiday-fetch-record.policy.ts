/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que cada desfecho de uma tentativa grava em `holiday_provider_fetches` (ADR-0100 §5). A tabela é
 * a fila: `next_attempt_at` nulo ou vencido é o que faz um par voltar a ser buscado.
 */
import { HOLIDAY_PROVIDER_FETCH_STATUS } from './holiday-provider.constant.js'
import type { FetchPair, FetchRecord } from './holiday-fetch.types.js'
import {
  HOLIDAY_PROVIDER_DEFAULT_RETRY_AFTER_SECONDS,
  HOLIDAY_PROVIDER_NOT_COVERED_RETRY_DAYS,
  HOLIDAY_PROVIDER_PLAN_RESTRICTED_RETRY_DAYS,
  HOLIDAY_PROVIDER_REFETCH_DAYS,
} from './holiday-provider-pull.constant.js'
import {
  addDays,
  addSeconds,
  resolveFailureNextAttemptAt,
} from './holiday-provider-schedule.policy.js'

type RecordParams = {
  readonly now: Date
  readonly pair: FetchPair
}

/** O par buscado volta a vencer em 180 dias (D8). */
export function resolveSuccessNextAttemptAt(now: Date): Date {
  return addDays({ date: now, days: HOLIDAY_PROVIDER_REFETCH_DAYS })
}

/** O par buscado: zera as falhas e só volta a vencer no `nextAttemptAt` (180 dias). */
export function buildSuccessRecord(
  input: RecordParams & { readonly nextAttemptAt: Date },
): FetchRecord {
  return {
    attempts: 0,
    errorCode: null,
    fetchedAt: input.now,
    nextAttemptAt: input.nextAttemptAt,
    pair: input.pair,
    status: HOLIDAY_PROVIDER_FETCH_STATUS.DONE,
  }
}

/** 404 ou fora da cobertura: nova tentativa em 90 dias, sem contar como falha. */
export function buildNotCoveredRecord({ now, pair }: RecordParams): FetchRecord {
  return {
    attempts: 0,
    errorCode: 'provider_not_found',
    fetchedAt: now,
    nextAttemptAt: addDays({ date: now, days: HOLIDAY_PROVIDER_NOT_COVERED_RETRY_DAYS }),
    pair,
    status: HOLIDAY_PROVIDER_FETCH_STATUS.NOT_COVERED,
  }
}

/** 5xx, rede e resposta fora do formato: recuo de 1 h, 6 h, 24 h e 7 dias. */
export function buildFailureRecord(
  input: RecordParams & { readonly errorCode: string },
): FetchRecord {
  const failedAttempts = input.pair.attempts + 1
  return {
    attempts: failedAttempts,
    errorCode: input.errorCode,
    fetchedAt: null,
    nextAttemptAt: resolveFailureNextAttemptAt({ failedAttempts, now: input.now }),
    pair: input.pair,
    status: HOLIDAY_PROVIDER_FETCH_STATUS.FAILED,
  }
}

/** 429 não é culpa do par: as tentativas não sobem, e ele espera o `Retry-After`. */
export function buildRateLimitedRecord(
  input: RecordParams & { readonly retryAfterSeconds: number | undefined },
): FetchRecord {
  return {
    attempts: input.pair.attempts,
    errorCode: 'provider_rate_limited',
    fetchedAt: null,
    nextAttemptAt: addSeconds({
      date: input.now,
      seconds: input.retryAfterSeconds ?? HOLIDAY_PROVIDER_DEFAULT_RETRY_AFTER_SECONDS,
    }),
    pair: input.pair,
    status: HOLIDAY_PROVIDER_FETCH_STATUS.FAILED,
  }
}

/** 402/403 numa cidade: o plano não a cobre. As tentativas não sobem, e o par só volta em 30 dias. */
export function buildPlanRestrictedRecord({ now, pair }: RecordParams): FetchRecord {
  return {
    attempts: pair.attempts,
    errorCode: 'provider_plan_restricted',
    fetchedAt: null,
    nextAttemptAt: addDays({ date: now, days: HOLIDAY_PROVIDER_PLAN_RESTRICTED_RETRY_DAYS }),
    pair,
    status: HOLIDAY_PROVIDER_FETCH_STATUS.FAILED,
  }
}
