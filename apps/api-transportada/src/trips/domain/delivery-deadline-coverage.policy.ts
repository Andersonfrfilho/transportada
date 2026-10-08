/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c: a cobertura do calendário de UMA viagem, para o calendário ser carregado uma vez. Do
 * menor ano entre chegadas, entregas e (se houver nota pendente) hoje até o maior entre as entregas, o
 * ano da última chegada + 1 (uma chegada em 30/12 vence no ano seguinte) e hoje. Só a nota pendente é
 * medida contra o hoje: a entregue é medida pela chegada e pela entrega, e a viagem lida anos depois não
 * pode perdê-la. Acima do vão máximo corta o começo: a nota que ficou de fora vira "sem prazo", nunca
 * "sem feriado".
 */
import type { BusinessCalendarCoverage } from '../../business-calendar/domain/business-calendar.types.js'
import { BUSINESS_CALENDAR_MAX_COVERAGE_SPAN_YEARS } from '../../business-calendar/domain/business-calendar.constant.js'

export type ResolveDeadlineCoverageParams = {
  readonly arrivalYears: readonly number[]
  readonly deliveryYears: readonly number[]
  /** `null` quando nenhuma nota está pendente. */
  readonly todayYear: number | null
}

export function resolveDeadlineCoverage(
  params: ResolveDeadlineCoverageParams,
): BusinessCalendarCoverage {
  const { arrivalYears, deliveryYears, todayYear } = params
  const todayYears = todayYear === null ? [] : [todayYear]
  const toYear = Math.max(...todayYears, ...arrivalYears.map((year) => year + 1), ...deliveryYears)
  const fromYear = Math.min(...todayYears, ...arrivalYears, ...deliveryYears)
  return {
    fromYear: Math.max(fromYear, toYear - BUSINESS_CALENDAR_MAX_COVERAGE_SPAN_YEARS),
    toYear,
  }
}
