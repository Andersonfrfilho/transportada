/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §3, "A exceção do companyId"): a consulta agregada do status. O cache do
 * fornecedor é global (sem `company_id`) e nunca sai cru; aqui ele só é lido A PARTIR da demanda da
 * própria empresa (`holiday_import_cities`) e das linhas dela, e o que sai é contagem, estado e a data das
 * cidades dela — nunca um id do cache nem uma cidade que a empresa não tem. Junto de
 * `holiday-import-usage.query.ts`, é um dos dois arquivos que a API deixa tocar o cache.
 */
import { and, asc, between, count, desc, eq, inArray, isNotNull, max } from 'drizzle-orm'

import { municipalHolidays } from '../../database/delivery-client.schema.js'
import { holidayImportCities } from '../../database/holiday-import.schema.js'
import {
  holidayProviderEntries,
  holidayProviderFetches,
} from '../../database/holiday-provider.schema.js'
import { stateHolidays } from '../../database/state-holiday.schema.js'
import {
  HOLIDAY_PROVIDER_FETCH_STATUS,
  HOLIDAY_PROVIDER_SCOPE,
} from '../../shared/holiday-provider.constant.js'
import type {
  HolidayImportCityYear,
  HolidayImportFailure,
  HolidayImportPairCounts,
  HolidayImportRemovedHoliday,
} from '../application/holiday-import.port.js'
import type { BusinessCalendarCoverage } from '../domain/business-calendar.types.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'

type Executor = Pick<BusinessCalendarDatabase, 'select'>
type Scope = { readonly companyId: string; readonly years: BusinessCalendarCoverage }

const REMOVED_LIST_LIMIT = 200
const UNKNOWN_ERROR_CODE = 'unknown'

/** Só a demanda desta empresa se liga ao cache, e só nos anos do horizonte. */
function cityFetchJoin(years: BusinessCalendarCoverage) {
  return and(
    eq(holidayProviderFetches.scope, HOLIDAY_PROVIDER_SCOPE.CITY),
    eq(holidayProviderFetches.ibgeCode, holidayImportCities.cityIbgeCode),
    between(holidayProviderFetches.year, years.fromYear, years.toYear),
  )
}

export async function countCompanyCities(executor: Executor, companyId: string): Promise<number> {
  const [row] = await executor
    .select({ total: count() })
    .from(holidayImportCities)
    .where(eq(holidayImportCities.companyId, companyId))
  return row?.total ?? 0
}

export type FetchSummary = {
  readonly failures: readonly HolidayImportFailure[]
  readonly lastFetchedAt: Date | null
  readonly pairs: Omit<HolidayImportPairCounts, 'pending' | 'total'>
}

export async function readFetchSummary(executor: Executor, scope: Scope): Promise<FetchSummary> {
  const rows = await executor
    .select({
      errorCode: holidayProviderFetches.lastErrorCode,
      lastFetchedAt: max(holidayProviderFetches.fetchedAt),
      pairs: count(),
      status: holidayProviderFetches.status,
    })
    .from(holidayImportCities)
    .innerJoin(holidayProviderFetches, cityFetchJoin(scope.years))
    .where(eq(holidayImportCities.companyId, scope.companyId))
    .groupBy(holidayProviderFetches.status, holidayProviderFetches.lastErrorCode)

  const total = (status: string) =>
    rows.filter((row) => row.status === status).reduce((sum, row) => sum + row.pairs, 0)
  const fetchedAt = rows.flatMap((row) => (row.lastFetchedAt === null ? [] : [row.lastFetchedAt]))
  return {
    failures: rows
      .filter((row) => row.status === HOLIDAY_PROVIDER_FETCH_STATUS.FAILED)
      .map((row) => ({ errorCode: row.errorCode ?? UNKNOWN_ERROR_CODE, pairs: row.pairs })),
    lastFetchedAt: fetchedAt.length === 0 ? null : new Date(Math.max(...fetchedAt.map(Number))),
    pairs: {
      done: total(HOLIDAY_PROVIDER_FETCH_STATUS.DONE),
      failed: total(HOLIDAY_PROVIDER_FETCH_STATUS.FAILED),
      notCovered: total(HOLIDAY_PROVIDER_FETCH_STATUS.NOT_COVERED),
      quotaExhausted: total(HOLIDAY_PROVIDER_FETCH_STATUS.QUOTA_EXHAUSTED),
    },
  }
}

/** A data que o fornecedor deixou de listar, nas linhas da própria empresa: elas ficam, sinalizadas. */
export async function listRemovedByProvider(
  executor: Executor,
  companyId: string,
): Promise<readonly HolidayImportRemovedHoliday[]> {
  const cityRows = await executor
    .select({
      holidayId: municipalHolidays.id,
      holidayOn: municipalHolidays.holidayOn,
      ibgeCode: municipalHolidays.cityIbgeCode,
      name: municipalHolidays.name,
    })
    .from(municipalHolidays)
    .innerJoin(
      holidayProviderEntries,
      eq(holidayProviderEntries.id, municipalHolidays.providerEntryId),
    )
    .where(
      and(eq(municipalHolidays.companyId, companyId), isNotNull(holidayProviderEntries.removedAt)),
    )
    .orderBy(asc(municipalHolidays.holidayOn), asc(municipalHolidays.cityIbgeCode))
    .limit(REMOVED_LIST_LIMIT)
  const stateRows = await executor
    .select({
      holidayId: stateHolidays.id,
      holidayOn: stateHolidays.holidayOn,
      ibgeCode: stateHolidays.stateIbgeCode,
      name: stateHolidays.name,
    })
    .from(stateHolidays)
    .innerJoin(holidayProviderEntries, eq(holidayProviderEntries.id, stateHolidays.providerEntryId))
    .where(and(eq(stateHolidays.companyId, companyId), isNotNull(holidayProviderEntries.removedAt)))
    .orderBy(asc(stateHolidays.holidayOn), asc(stateHolidays.stateIbgeCode))
    .limit(REMOVED_LIST_LIMIT)

  return [
    ...cityRows.map((row) => ({ ...row, scope: HOLIDAY_PROVIDER_SCOPE.CITY })),
    ...stateRows.map((row) => ({
      ...row,
      holidayOn: requirePersistedRow(row.holidayOn),
      scope: HOLIDAY_PROVIDER_SCOPE.STATE,
    })),
  ].sort((first, second) => first.holidayOn.localeCompare(second.holidayOn))
}

type CityRow = {
  readonly cityIbgeCode: string
  readonly documentCount: number
  readonly lastSeenAt: Date
}

export function listCompanyCities(
  executor: Executor,
  input: { readonly companyId: string; readonly page: number; readonly perPage: number },
): Promise<readonly CityRow[]> {
  return executor
    .select({
      cityIbgeCode: holidayImportCities.cityIbgeCode,
      documentCount: holidayImportCities.documentCount,
      lastSeenAt: holidayImportCities.lastSeenAt,
    })
    .from(holidayImportCities)
    .where(eq(holidayImportCities.companyId, input.companyId))
    .orderBy(desc(holidayImportCities.documentCount), asc(holidayImportCities.cityIbgeCode))
    .limit(input.perPage)
    .offset((input.page - 1) * input.perPage)
}

export type CityFetchRow = HolidayImportCityYear & { readonly cityIbgeCode: string }

/** O estado do cache só das cidades pedidas, que já saíram da demanda desta empresa. */
export async function listCityFetches(
  executor: Executor,
  input: Scope & { readonly cityCodes: readonly string[] },
): Promise<readonly CityFetchRow[]> {
  return executor
    .select({
      attempts: holidayProviderFetches.attempts,
      cityIbgeCode: holidayImportCities.cityIbgeCode,
      errorCode: holidayProviderFetches.lastErrorCode,
      fetchedAt: holidayProviderFetches.fetchedAt,
      nextAttemptAt: holidayProviderFetches.nextAttemptAt,
      status: holidayProviderFetches.status,
      year: holidayProviderFetches.year,
    })
    .from(holidayImportCities)
    .innerJoin(holidayProviderFetches, cityFetchJoin(input.years))
    .where(
      and(
        eq(holidayImportCities.companyId, input.companyId),
        inArray(holidayImportCities.cityIbgeCode, [...input.cityCodes]),
      ),
    )
    .orderBy(asc(holidayProviderFetches.year))
}
