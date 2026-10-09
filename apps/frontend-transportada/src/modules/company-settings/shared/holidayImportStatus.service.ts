/* Copyright (c) 2026 Ada Technology. MIT License. */
import { HOLIDAY_FETCH_FAILURE_CODES, HOLIDAY_IMPORT_HEADLINE } from './holidayImport.constant'
import type {
  HolidayImportHeadline,
  HolidayImportStatus,
  HolidayImportStatusView,
} from './holidayImport.types'

const FAILURE_MESSAGE_PREFIX = 'import.failures'
const UNKNOWN_FAILURE = 'unknown'

function isKnownFailure(code: string): boolean {
  return HOLIDAY_FETCH_FAILURE_CODES.some((known) => known === code)
}

/**
 * Uma manchete só, por prioridade: empresa fora da importação, falha, cota esgotada, ainda sem a primeira busca, em
 * dia. Os números ficam todos na tela — a manchete é a primeira coisa que o operador precisa saber, não a única.
 */
function resolveHeadline(status: HolidayImportStatus): HolidayImportHeadline {
  if (!status.isEnabled) return HOLIDAY_IMPORT_HEADLINE.DISABLED
  if (status.failures.length > 0 || status.pairs.failed > 0) return HOLIDAY_IMPORT_HEADLINE.FAILING
  if (status.pairs.quotaExhausted > 0) return HOLIDAY_IMPORT_HEADLINE.QUOTA
  if (status.lastFetchedAt === null) return HOLIDAY_IMPORT_HEADLINE.WAITING
  return HOLIDAY_IMPORT_HEADLINE.HEALTHY
}

export function resolveImportStatusView(status: HolidayImportStatus): HolidayImportStatusView {
  const { done, total } = status.pairs
  return {
    failures: status.failures.map(({ errorCode, pairs }) => ({
      code: errorCode,
      messageKey: `${FAILURE_MESSAGE_PREFIX}.${isKnownFailure(errorCode) ? errorCode : UNKNOWN_FAILURE}`,
      pairs,
    })),
    headline: resolveHeadline(status),
    progress: { done, ratio: total === 0 ? 0 : done / total, total },
  }
}
