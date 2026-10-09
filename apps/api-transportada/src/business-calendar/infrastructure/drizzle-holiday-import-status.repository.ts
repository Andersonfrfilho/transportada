/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §3): o status da importação de feriados. Este repositório não importa o cache
 * global: ele chama as duas consultas agregadas (`holiday-import-*.query.ts`), que recortam pelas cidades da
 * empresa do contexto. As leituras são em série, como as do resto do calendário.
 */
import { eq } from 'drizzle-orm'

import { companyHolidayImportSettings } from '../../database/holiday-import.schema.js'
import { HOLIDAY_PROVIDER_FETCH_STATUS } from '../../shared/holiday-provider.constant.js'
import type {
  HolidayImportCitiesPage,
  HolidayImportCity,
  HolidayImportCityYear,
  HolidayImportStatus,
  HolidayImportStatusPort,
} from '../application/holiday-import.port.js'
import type { BusinessCalendarCoverage } from '../domain/business-calendar.types.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import {
  type CityFetchRow,
  countCompanyCities,
  listCityFetches,
  listCompanyCities,
  readFetchSummary,
} from './holiday-import-status.query.js'
import { listRemovedByProvider } from './holiday-import-removed.query.js'
import { readMonthlyRequests } from './holiday-import-usage.query.js'

function listYears(years: BusinessCalendarCoverage): readonly number[] {
  const list: number[] = []
  for (let year = years.fromYear; year <= years.toYear; year += 1) list.push(year)
  return list
}

/** Ano sem linha no cache é par ainda não buscado: `pending`, zero tentativas. */
function pendingYear(year: number): HolidayImportCityYear {
  return {
    attempts: 0,
    errorCode: null,
    fetchedAt: null,
    nextAttemptAt: null,
    status: HOLIDAY_PROVIDER_FETCH_STATUS.PENDING,
    year,
  }
}

/** A linha do cache vira só o estado do par: nem a cidade repetida nem id nenhum do cache sai. */
function toCityYear(fetch: CityFetchRow): HolidayImportCityYear {
  return {
    attempts: fetch.attempts,
    errorCode: fetch.errorCode,
    fetchedAt: fetch.fetchedAt,
    nextAttemptAt: fetch.nextAttemptAt,
    status: fetch.status,
    year: fetch.year,
  }
}

/**
 * O que falta do total. As leituras do status são consultas separadas: uma busca que termina entre elas pode
 * somar mais do que o total, e pendente negativo seria número sem sentido na tela.
 */
export function countPendingPairs(input: {
  readonly done: number
  readonly failed: number
  readonly notCovered: number
  readonly quotaExhausted: number
  readonly total: number
}): number {
  const fetched = input.done + input.failed + input.notCovered + input.quotaExhausted
  return Math.max(0, input.total - fetched)
}

export class DrizzleHolidayImportStatusRepository implements HolidayImportStatusPort {
  public constructor(private readonly database: BusinessCalendarDatabase) {}

  public async listCities(input: {
    readonly companyId: string
    readonly page: number
    readonly perPage: number
    readonly years: BusinessCalendarCoverage
  }): Promise<HolidayImportCitiesPage> {
    const { companyId, years } = input
    const total = await countCompanyCities(this.database, companyId)
    const cities = await listCompanyCities(this.database, input)
    if (cities.length === 0) return { items: [], total }

    const fetches = await listCityFetches(this.database, {
      cityCodes: cities.map((city) => city.cityIbgeCode),
      companyId,
      years,
    })
    const items = cities.map((city): HolidayImportCity => {
      const known = fetches.filter((fetch) => fetch.cityIbgeCode === city.cityIbgeCode)
      return {
        ...city,
        years: listYears(years).map((year) => {
          const fetched = known.find((fetch) => fetch.year === year)
          return fetched === undefined ? pendingYear(year) : toCityYear(fetched)
        }),
      }
    })
    return { items, total }
  }

  public async readStatus(input: {
    readonly companyId: string
    readonly month: string
    readonly today: string
    readonly years: BusinessCalendarCoverage
  }): Promise<HolidayImportStatus> {
    const { companyId, years } = input
    const totalCities = await countCompanyCities(this.database, companyId)
    const summary = await readFetchSummary(this.database, { companyId, years })
    const removedByProvider = await listRemovedByProvider(this.database, {
      companyId,
      today: input.today,
    })
    const monthlyRequests = await readMonthlyRequests(this.database, { month: input.month })
    const [settings] = await this.database
      .select({ isEnabled: companyHolidayImportSettings.isEnabled })
      .from(companyHolidayImportSettings)
      .where(eq(companyHolidayImportSettings.companyId, companyId))
      .limit(1)

    const counted = summary.pairs
    const total = totalCities * listYears(years).length
    return {
      failures: summary.failures,
      isEnabled: settings?.isEnabled ?? true,
      lastFetchedAt: summary.lastFetchedAt,
      month: input.month,
      monthlyRequests,
      pairs: {
        ...counted,
        pending: countPendingPairs({ ...counted, total }),
        total,
      },
      removedByProvider,
      totalCities,
    }
  }
}
