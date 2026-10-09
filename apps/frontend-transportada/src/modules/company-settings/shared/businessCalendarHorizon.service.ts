/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  BUSINESS_CALENDAR_TIME_ZONE,
  MATERIALIZATION_WARNING_MARGIN_YEARS,
  MATERIALIZATION_YEARS,
} from './businessCalendar.constant'
import type { MunicipalHolidayRule } from './businessCalendar.types'

type RulesInput = Readonly<{ currentYear: number; rules: readonly MunicipalHolidayRule[] }>

/** O ano em que a API gera as datas: o de São Paulo, não o do navegador (a virada da noite de 31/12 difere). */
export function readCalendarYear(now: Date): number {
  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_CALENDAR_TIME_ZONE,
    year: 'numeric',
  }).format(now)
  return Number(year)
}

/** O dia civil de hoje em São Paulo (`AAAA-MM-DD`): a API só desliga data de hoje em diante (D7). */
export function readCalendarToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: BUSINESS_CALENDAR_TIME_ZONE,
    year: 'numeric',
  }).format(now)
}

/** A API desliga a data de hoje em diante: hoje ainda vale, ontem já é 409 (D7). */
export function canDisableHolidayOn(
  input: Readonly<{ holidayOn: string; today: string }>,
): boolean {
  return input.holidayOn >= input.today
}

/** Sem rotina agendada (ADR-0096 §6): é a tela quem avisa quando alguma regra fica abaixo do ano corrente + 2. */
export function hasShortMaterializationHorizon(input: RulesInput): boolean {
  const limit = input.currentYear + MATERIALIZATION_WARNING_MARGIN_YEARS
  return input.rules.some((rule) => rule.materializedThroughYear < limit)
}

/** O menor "gerado até": é até ali que o roteiro fecha os clientes em todas as regras. */
export function resolveCoveredThroughYear(input: RulesInput): number {
  const years = input.rules.map((rule) => rule.materializedThroughYear)
  return years.length === 0 ? input.currentYear + MATERIALIZATION_YEARS : Math.min(...years)
}
