/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys, hasKeys } from '@/modules/shared/objectKeys.service'

import { isNullableString, isNumber, isString } from './businessCalendarGuards.validation'
import { HOLIDAY_IMPORT_SCOPES } from './holidayImport.constant'
import type {
  HolidayImportFailure,
  HolidayImportLastRun,
  HolidayImportPairCounts,
  HolidayImportRemoved,
  HolidayImportRemovedList,
  HolidayImportStatus,
  HolidayImportSuppression,
} from './holidayImport.types'

/**
 * Guardas de chaves exatas com o formato real de `holiday-import.schema.ts` da API: nada do cache global do
 * fornecedor sai cru, e chave a mais é recusada como em todo o calendário.
 */
const STATUS_KEYS = [
  'failures',
  'isEnabled',
  'lastFetchedAt',
  'month',
  'monthlyRequests',
  'pairs',
  'removedByProvider',
  'totalCities',
] as const
const OPTIONAL_STATUS_KEYS = ['lastRun'] as const
const PAIR_KEYS = ['done', 'failed', 'notCovered', 'pending', 'quotaExhausted', 'total'] as const
const OPTIONAL_PAIR_KEYS = ['planRestricted'] as const
const LAST_RUN_KEYS = ['finishedAt', 'outcome'] as const
const FAILURE_KEYS = ['errorCode', 'pairs'] as const
const REMOVED_LIST_KEYS = ['items', 'truncated'] as const
const REMOVED_KEYS = ['holidayId', 'holidayOn', 'ibgeCode', 'name', 'scope'] as const
const SUPPRESSION_KEYS = ['holidayOn', 'ibgeCode', 'id', 'scope', 'suppressedAt'] as const
const PAGED_KEYS = ['data', 'pagination'] as const
const PAGINATION_KEYS = ['page', 'perPage', 'total'] as const

function isScope(value: unknown): boolean {
  return HOLIDAY_IMPORT_SCOPES.some((scope) => scope === value)
}

function isEveryItem<TItem>(
  value: unknown,
  guard: (item: unknown) => item is TItem,
): value is readonly TItem[] {
  return Array.isArray(value) && value.every(guard)
}

/** Os campos do cartão honesto são opcionais: o painel é publicado antes da API, e a chave ausente vale como antes. */
function isPairCounts(value: unknown): value is HolidayImportPairCounts {
  const allowed = [...PAIR_KEYS, ...OPTIONAL_PAIR_KEYS]
  return (
    hasKeys(value, { allowed, required: PAIR_KEYS }) &&
    allowed.every((key) => !(key in value) || isNumber(value[key]))
  )
}

function isLastRun(value: unknown): value is HolidayImportLastRun {
  return hasExactKeys(value, LAST_RUN_KEYS) && isString(value.finishedAt) && isString(value.outcome)
}

function isOptionalLastRun(value: Record<string, unknown>): boolean {
  return !('lastRun' in value) || value.lastRun === null || isLastRun(value.lastRun)
}

function isFailure(value: unknown): value is HolidayImportFailure {
  return hasExactKeys(value, FAILURE_KEYS) && isString(value.errorCode) && isNumber(value.pairs)
}

function isRemoved(value: unknown): value is HolidayImportRemoved {
  return (
    hasExactKeys(value, REMOVED_KEYS) &&
    isString(value.holidayId) &&
    isString(value.holidayOn) &&
    isString(value.ibgeCode) &&
    isString(value.name) &&
    isScope(value.scope)
  )
}

function isRemovedList(value: unknown): value is HolidayImportRemovedList {
  return (
    hasExactKeys(value, REMOVED_LIST_KEYS) &&
    typeof value.truncated === 'boolean' &&
    isEveryItem(value.items, isRemoved)
  )
}

export function isHolidayImportStatus(value: unknown): value is HolidayImportStatus {
  return (
    hasKeys(value, { allowed: [...STATUS_KEYS, ...OPTIONAL_STATUS_KEYS], required: STATUS_KEYS }) &&
    isOptionalLastRun(value) &&
    isEveryItem(value.failures, isFailure) &&
    typeof value.isEnabled === 'boolean' &&
    isNullableString(value.lastFetchedAt) &&
    isString(value.month) &&
    isNumber(value.monthlyRequests) &&
    isPairCounts(value.pairs) &&
    isRemovedList(value.removedByProvider) &&
    isNumber(value.totalCities)
  )
}

export function isHolidayImportSuppression(value: unknown): value is HolidayImportSuppression {
  return (
    hasExactKeys(value, SUPPRESSION_KEYS) &&
    isString(value.holidayOn) &&
    isString(value.ibgeCode) &&
    isString(value.id) &&
    isScope(value.scope) &&
    isString(value.suppressedAt)
  )
}

type PagedEnvelope = Readonly<{
  data: unknown
  pagination: Readonly<{ page: number; perPage: number; total: number }>
}>

function isPagination(value: unknown): value is PagedEnvelope['pagination'] {
  return (
    hasExactKeys(value, PAGINATION_KEYS) && PAGINATION_KEYS.every((key) => isNumber(value[key]))
  )
}

/** A lista paginada chega com `pagination`; o envelope simples `{ data }` não serve a ela. */
export function isPagedEnvelope(value: unknown): value is PagedEnvelope {
  return hasExactKeys(value, PAGED_KEYS) && isPagination(value.pagination)
}
