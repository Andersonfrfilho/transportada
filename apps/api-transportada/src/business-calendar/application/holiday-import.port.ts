/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §3, §4): a gestão da importação de feriados. A supressão é o que mantém um
 * feriado importado desligado; o status é o que a rotina do worker deixou, agregado só para as cidades da
 * empresa — nada aqui é uma linha do cache global.
 */
import type {
  HolidayImportScope,
  HolidayProviderFetchStatus,
} from '../../shared/holiday-provider.constant.js'
import type { BusinessCalendarCoverage } from '../domain/business-calendar.types.js'
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'

export type { HolidayImportScope }

export type HolidayImportSuppression = {
  readonly holidayOn: string
  readonly ibgeCode: string
  readonly id: string
  readonly scope: HolidayImportScope
  readonly suppressedAt: Date
}

export type DisableImportedHolidayInput = BusinessCalendarActor & {
  readonly currentYear: number
  readonly holidayId: string
  readonly scope: HolidayImportScope
  readonly today: string
}

export type HolidayImportSuppressionPort = {
  /** Apaga a linha importada, grava a supressão e audita; só de `today` em diante. */
  disable(input: DisableImportedHolidayInput): Promise<HolidayImportSuppression>
  list(input: { readonly companyId: string }): Promise<readonly HolidayImportSuppression[]>
  /** Apaga a supressão; o feriado volta no ciclo seguinte. Id ausente ou de outra empresa é no-op. */
  restore(input: BusinessCalendarActor & { readonly id: string }): Promise<void>
}

/** Pares (cidade, ano) do horizonte; os que o cache ainda não tem contam como pendentes. */
export type HolidayImportPairCounts = {
  readonly done: number
  readonly failed: number
  readonly notCovered: number
  readonly pending: number
  readonly quotaExhausted: number
  readonly total: number
}

export type HolidayImportFailure = {
  readonly errorCode: string
  readonly pairs: number
}

/** A linha da PRÓPRIA empresa cuja data o fornecedor deixou de listar: ela fica, sinalizada. */
export type HolidayImportRemovedHoliday = {
  readonly holidayId: string
  readonly holidayOn: string
  readonly ibgeCode: string
  readonly name: string
  readonly scope: HolidayImportScope
}

export type HolidayImportStatus = {
  readonly failures: readonly HolidayImportFailure[]
  readonly isEnabled: boolean
  readonly lastFetchedAt: Date | null
  /** O primeiro dia do mês do orçamento. */
  readonly month: string
  /** Requisições do mês na instalação (o contador é do banco, não da empresa). */
  readonly monthlyRequests: number
  readonly pairs: HolidayImportPairCounts
  readonly removedByProvider: readonly HolidayImportRemovedHoliday[]
  readonly totalCities: number
}

export type HolidayImportCityYear = {
  readonly attempts: number
  readonly errorCode: string | null
  readonly fetchedAt: Date | null
  readonly nextAttemptAt: Date | null
  readonly status: HolidayProviderFetchStatus
  readonly year: number
}

export type HolidayImportCity = {
  readonly cityIbgeCode: string
  readonly documentCount: number
  readonly lastSeenAt: Date
  readonly years: readonly HolidayImportCityYear[]
}

export type HolidayImportCitiesPage = {
  readonly items: readonly HolidayImportCity[]
  readonly total: number
}

export type HolidayImportStatusPort = {
  listCities(input: {
    readonly companyId: string
    readonly page: number
    readonly perPage: number
    readonly years: BusinessCalendarCoverage
  }): Promise<HolidayImportCitiesPage>
  readStatus(input: {
    readonly companyId: string
    readonly month: string
    readonly years: BusinessCalendarCoverage
  }): Promise<HolidayImportStatus>
}
