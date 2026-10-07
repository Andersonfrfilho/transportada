/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  BusinessCalendarCoverage,
  MunicipalHolidayRule,
  StateHolidayRule,
} from '../domain/business-calendar.types.js'

export type LoadBusinessCalendarRulesParams = {
  /** Códigos IBGE das cidades do pedido; as UFs saem dos dois primeiros dígitos. */
  readonly cityCodes: readonly string[]
  readonly companyId: string
  readonly coverage: BusinessCalendarCoverage
}

export type LoadedBusinessCalendarRules = {
  readonly municipalRules: readonly MunicipalHolidayRule[]
  readonly saturdayIsBusinessDay: boolean
  readonly stateRules: readonly StateHolidayRule[]
}

/** O que `buildBusinessCalendar` consome, em uma consulta por tabela e já recortado pela empresa. */
export type BusinessCalendarRulesPort = {
  loadRules(params: LoadBusinessCalendarRulesParams): Promise<LoadedBusinessCalendarRules>
}
