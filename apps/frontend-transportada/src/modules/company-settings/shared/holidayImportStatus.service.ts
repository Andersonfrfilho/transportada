/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  HOLIDAY_FETCH_FAILURE_CODES,
  HOLIDAY_IMPORT_HEADLINE,
  HOLIDAY_PLAN_RESTRICTED_CODE,
  HOLIDAY_RUN_FAILURE_HEADLINE,
} from './holidayImport.constant'
import type {
  HolidayImportFailure,
  HolidayImportHeadline,
  HolidayImportStatus,
  HolidayImportStatusView,
} from './holidayImport.types'

const FAILURE_MESSAGE_PREFIX = 'import.failures'
const UNKNOWN_FAILURE = 'unknown'

function isKnownFailure(code: string): boolean {
  return HOLIDAY_FETCH_FAILURE_CODES.some((known) => known === code)
}

function resolveRunFailureHeadline(outcome: string | undefined): HolidayImportHeadline | undefined {
  return Object.entries(HOLIDAY_RUN_FAILURE_HEADLINE).find(([code]) => code === outcome)?.[1]
}

/**
 * Par fora do plano é aviso, não falha: só quando a API manda a contagem (`planRestricted`) ele sai da lista de falhas
 * e do contador. Sem ela (API anterior), tudo segue como antes.
 */
function listVisibleFailures(status: HolidayImportStatus): readonly HolidayImportFailure[] {
  if (status.pairs.planRestricted === undefined) return status.failures
  return status.failures.filter((failure) => failure.errorCode !== HOLIDAY_PLAN_RESTRICTED_CODE)
}

function countFailedPairs(status: HolidayImportStatus): number {
  return Math.max(0, status.pairs.failed - (status.pairs.planRestricted ?? 0))
}

/**
 * Uma manchete só, por prioridade: empresa fora da importação, o que o fornecedor fez no último ciclo da rotina, falha
 * por par, ainda sem a primeira busca, em dia. Os números ficam todos na tela — a manchete é a primeira coisa que o
 * operador precisa saber, não a única.
 */
function resolveHeadline(status: HolidayImportStatus): HolidayImportHeadline {
  if (!status.isEnabled) return HOLIDAY_IMPORT_HEADLINE.DISABLED
  const runHeadline = resolveRunFailureHeadline(status.lastRun?.outcome)
  if (runHeadline !== undefined) return runHeadline
  if (listVisibleFailures(status).length > 0 || countFailedPairs(status) > 0) {
    return HOLIDAY_IMPORT_HEADLINE.FAILING
  }
  if (status.lastFetchedAt === null) return HOLIDAY_IMPORT_HEADLINE.WAITING
  return HOLIDAY_IMPORT_HEADLINE.HEALTHY
}

export function resolveImportStatusView(status: HolidayImportStatus): HolidayImportStatusView {
  const { done, total } = status.pairs
  return {
    failedPairs: countFailedPairs(status),
    failures: listVisibleFailures(status).map(({ errorCode, pairs }) => ({
      code: errorCode,
      messageKey: `${FAILURE_MESSAGE_PREFIX}.${isKnownFailure(errorCode) ? errorCode : UNKNOWN_FAILURE}`,
      pairs,
    })),
    headline: resolveHeadline(status),
    lastRunFinishedAt: status.lastRun?.finishedAt ?? null,
    planRestrictedPairs: status.pairs.planRestricted ?? 0,
    progress: { done, ratio: total === 0 ? 0 : done / total, total },
  }
}
