/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §4): a entrada e a saída das rotas da gestão da importação de feriados. O corpo é
 * `.strict()` (a empresa e o ator nunca vêm dele) e cada visão é lista branca de campos: nada do cache
 * global sai cru, nem um id dele.
 */
import { z } from 'zod'

import { invalidRequest, parseBody, readListQuery } from '../../http/request-parsing.service.js'
import { HOLIDAY_IMPORT_SUPPRESSION_SCOPES } from '../../shared/holiday-provider.constant.js'
import type {
  HolidayImportCitiesPage,
  HolidayImportScope,
  HolidayImportStatus,
  HolidayImportSuppression,
} from '../application/holiday-import.port.js'

const PAGE_QUERY_KEYS: ReadonlySet<string> = new Set(['page', 'perPage'])
const NO_QUERY_KEYS: ReadonlySet<string> = new Set()
const DEFAULT_PAGE = 1
const DEFAULT_PER_PAGE = 50
const MAX_PAGE = 10_000
const MAX_PER_PAGE = 100
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/u

const disableSchema = z
  .object({ holidayId: z.uuid(), scope: z.enum(HOLIDAY_IMPORT_SUPPRESSION_SCOPES) })
  .strict()

export type DisableHolidayBody = {
  readonly holidayId: string
  readonly scope: HolidayImportScope
}

export function parseDisableBody(request: Request): Promise<DisableHolidayBody> {
  return parseBody(disableSchema, request)
}

type PageQuery = { readonly page: number; readonly perPage: number }

function readBoundedInteger(input: {
  readonly field: string
  readonly fallback: number
  readonly max: number
  readonly raw: string | null
}): number {
  if (input.raw === null) return input.fallback
  const value = Number(input.raw)
  if (!POSITIVE_INTEGER_PATTERN.test(input.raw) || value > input.max) {
    throw invalidRequest([{ field: input.field, message: 'is invalid' }])
  }
  return value
}

/** Rota sem filtro: query nenhuma é aceita, para o cliente não crer que filtrou. */
export function parseNoQuery(request: Request): undefined {
  readListQuery(new URL(request.url), NO_QUERY_KEYS)
  return undefined
}

export function parsePageQuery(request: Request): PageQuery {
  const params = readListQuery(new URL(request.url), PAGE_QUERY_KEYS)
  return {
    page: readBoundedInteger({
      fallback: DEFAULT_PAGE,
      field: 'page',
      max: MAX_PAGE,
      raw: params.get('page'),
    }),
    perPage: readBoundedInteger({
      fallback: DEFAULT_PER_PAGE,
      field: 'perPage',
      max: MAX_PER_PAGE,
      raw: params.get('perPage'),
    }),
  }
}

export type SuppressionView = {
  readonly holidayOn: string
  readonly ibgeCode: string
  readonly id: string
  readonly scope: HolidayImportScope
  readonly suppressedAt: string
}

export function toSuppressionView(suppression: HolidayImportSuppression): SuppressionView {
  return {
    holidayOn: suppression.holidayOn,
    ibgeCode: suppression.ibgeCode,
    id: suppression.id,
    scope: suppression.scope,
    suppressedAt: suppression.suppressedAt.toISOString(),
  }
}

export type StatusView = {
  readonly failures: readonly { readonly errorCode: string; readonly pairs: number }[]
  readonly isEnabled: boolean
  readonly lastFetchedAt: string | null
  readonly lastRun: { readonly finishedAt: string; readonly outcome: string } | null
  readonly month: string
  readonly monthlyRequests: number
  readonly pairs: HolidayImportStatus['pairs']
  readonly removedByProvider: {
    readonly items: HolidayImportStatus['removedByProvider']['items']
    readonly truncated: boolean
  }
  readonly totalCities: number
}

export function toStatusView(status: HolidayImportStatus): StatusView {
  return {
    failures: status.failures.map(({ errorCode, pairs }) => ({ errorCode, pairs })),
    isEnabled: status.isEnabled,
    lastFetchedAt: status.lastFetchedAt === null ? null : status.lastFetchedAt.toISOString(),
    lastRun:
      status.lastRun === null
        ? null
        : { finishedAt: status.lastRun.finishedAt.toISOString(), outcome: status.lastRun.outcome },
    month: status.month,
    monthlyRequests: status.monthlyRequests,
    pairs: {
      done: status.pairs.done,
      failed: status.pairs.failed,
      notCovered: status.pairs.notCovered,
      pending: status.pairs.pending,
      planRestricted: status.pairs.planRestricted,
      quotaExhausted: status.pairs.quotaExhausted,
      total: status.pairs.total,
    },
    removedByProvider: {
      items: status.removedByProvider.items.map((holiday) => ({
        holidayId: holiday.holidayId,
        holidayOn: holiday.holidayOn,
        ibgeCode: holiday.ibgeCode,
        name: holiday.name,
        scope: holiday.scope,
      })),
      truncated: status.removedByProvider.truncated,
    },
    totalCities: status.totalCities,
  }
}

export type CityView = {
  readonly cityIbgeCode: string
  readonly documentCount: number
  readonly lastSeenAt: string
  readonly years: readonly {
    readonly attempts: number
    readonly errorCode: string | null
    readonly fetchedAt: string | null
    readonly nextAttemptAt: string | null
    readonly status: string
    readonly year: number
  }[]
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString()
}

export function toCityViews(page: HolidayImportCitiesPage): readonly CityView[] {
  return page.items.map((city) => ({
    cityIbgeCode: city.cityIbgeCode,
    documentCount: city.documentCount,
    lastSeenAt: city.lastSeenAt.toISOString(),
    years: city.years.map((year) => ({
      attempts: year.attempts,
      errorCode: year.errorCode,
      fetchedAt: isoOrNull(year.fetchedAt),
      nextAttemptAt: isoOrNull(year.nextAttemptAt),
      status: year.status,
      year: year.year,
    })),
  }))
}
