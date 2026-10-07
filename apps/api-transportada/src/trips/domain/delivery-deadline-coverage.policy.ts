/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c: a cobertura do calendário de UMA viagem, para o calendário ser carregado uma vez. Do
 * menor ano entre chegadas, entregas e hoje até o maior entre hoje e o ano da última chegada + 1 (uma
 * chegada em 30/12 vence no ano seguinte). Acima do vão máximo corta o começo: a nota que ficou de fora
 * vira "sem prazo", nunca "sem feriado".
 */
import type { BusinessCalendarCoverage } from '../../business-calendar/domain/business-calendar.types.js'
import { BUSINESS_CALENDAR_MAX_COVERAGE_SPAN_YEARS } from '../../business-calendar/domain/business-calendar.constant.js'

export type ResolveDeadlineCoverageParams = {
  readonly arrivalYears: readonly number[]
  readonly deliveryYears: readonly number[]
  readonly todayYear: number
}

export function resolveDeadlineCoverage(
  params: ResolveDeadlineCoverageParams,
): BusinessCalendarCoverage {
  const { arrivalYears, deliveryYears, todayYear } = params
  const toYear = Math.max(todayYear, ...arrivalYears.map((year) => year + 1))
  const fromYear = Math.min(todayYear, ...arrivalYears, ...deliveryYears)
  return {
    fromYear: Math.max(fromYear, toYear - BUSINESS_CALENDAR_MAX_COVERAGE_SPAN_YEARS),
    toYear,
  }
}
