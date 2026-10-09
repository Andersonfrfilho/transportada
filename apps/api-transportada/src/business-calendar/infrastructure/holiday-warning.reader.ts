/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6): lê o aviso de feriado de uma lista de dias por cidade. O custo é fixo: as quatro
 * leituras do calendário, em série (o executor pode ser uma transação), uma vez só para todas as cidades que
 * ainda não têm calendário — ou zero, se quem chama já carregou o calendário e ele cobre os anos. Calendário
 * que a política recusa não derruba as outras cidades: volta em `refusals`, com o código. Reaproveitável pelo
 * detalhe da viagem, pela montagem e pelo app do motorista; não conhece o prazo de entrega.
 */
import type {
  HolidayWarningItem,
  HolidayWarningsResult,
  ReadHolidayWarningsParams,
} from '../application/holiday-warning.port.js'
import {
  isBusinessCalendarErrorCode,
  type BusinessCalendarErrorCode,
} from '../domain/business-calendar.constant.js'
import { BusinessCalendarError } from '../domain/business-calendar.error.js'
import type {
  BusinessCalendar,
  BusinessCalendarCoverage,
} from '../domain/business-calendar.types.js'
import { buildBusinessCalendar } from '../domain/business-calendar-build.policy.js'
import { buildHolidayWarning, type HolidayWarning } from '../domain/holiday-warning.policy.js'
import {
  loadBusinessCalendarRules,
  type BusinessCalendarRulesExecutor,
} from './business-calendar-rules.query.js'

type Needs = ReadonlyMap<string, BusinessCalendarCoverage>

function yearOf(item: HolidayWarningItem): number {
  return Number(item.date.slice(0, 4))
}

/** Os anos que cada cidade precisa ter no calendário: do menor ao maior dos itens dela. */
function collectNeeds(items: readonly HolidayWarningItem[]): Needs {
  const needs = new Map<string, BusinessCalendarCoverage>()
  for (const item of items) {
    const year = yearOf(item)
    const current = needs.get(item.cityIbgeCode)
    needs.set(item.cityIbgeCode, {
      fromYear: current === undefined ? year : Math.min(current.fromYear, year),
      toYear: current === undefined ? year : Math.max(current.toYear, year),
    })
  }
  return needs
}

function covers(calendar: BusinessCalendar, need: BusinessCalendarCoverage): boolean {
  return calendar.coverage.fromYear <= need.fromYear && calendar.coverage.toYear >= need.toYear
}

function toRefusalCode(error: unknown): BusinessCalendarErrorCode {
  if (error instanceof BusinessCalendarError && isBusinessCalendarErrorCode(error.code)) {
    return error.code
  }
  throw error
}

type Loaded = {
  readonly calendars: ReadonlyMap<string, BusinessCalendar>
  readonly refusals: ReadonlyMap<string, BusinessCalendarErrorCode>
}

/** Uma carga só para todas as cidades que faltam, com a cobertura que alcança as datas de todas. */
async function loadMissing(
  executor: BusinessCalendarRulesExecutor,
  input: { readonly companyId: string; readonly missing: Needs },
): Promise<Loaded> {
  const needs = [...input.missing.values()]
  const coverage: BusinessCalendarCoverage = {
    fromYear: Math.min(...needs.map((need) => need.fromYear)),
    toYear: Math.max(...needs.map((need) => need.toYear)),
  }
  const cityCodes = [...input.missing.keys()]
  const rules = await loadBusinessCalendarRules(executor, {
    cityCodes,
    companyId: input.companyId,
    coverage,
  })
  const calendars = new Map<string, BusinessCalendar>()
  const refusals = new Map<string, BusinessCalendarErrorCode>()
  for (const cityIbgeCode of cityCodes) {
    try {
      calendars.set(cityIbgeCode, buildBusinessCalendar({ ...rules, cityIbgeCode, coverage }))
    } catch (error) {
      refusals.set(cityIbgeCode, toRefusalCode(error))
    }
  }
  return { calendars, refusals }
}

export async function readHolidayWarnings(
  executor: BusinessCalendarRulesExecutor,
  params: ReadHolidayWarningsParams,
): Promise<HolidayWarningsResult> {
  const needs = collectNeeds(params.items)
  const calendars = new Map<string, BusinessCalendar>()
  const missing = new Map<string, BusinessCalendarCoverage>()
  for (const [cityIbgeCode, need] of needs) {
    const known = params.knownCalendars?.get(cityIbgeCode)
    if (known !== undefined && covers(known, need)) calendars.set(cityIbgeCode, known)
    else missing.set(cityIbgeCode, need)
  }
  const loaded: Loaded =
    missing.size === 0
      ? { calendars: new Map(), refusals: new Map() }
      : await loadMissing(executor, { companyId: params.companyId, missing })
  for (const [cityIbgeCode, calendar] of loaded.calendars) calendars.set(cityIbgeCode, calendar)

  const warnings = new Map<string, HolidayWarning>()
  for (const item of params.items) {
    const calendar = calendars.get(item.cityIbgeCode)
    if (calendar === undefined) continue
    const warning = buildHolidayWarning({
      calendar,
      date: item.date,
      ...(item.cityName === undefined ? {} : { cityName: item.cityName }),
    })
    if (warning !== undefined) warnings.set(item.key, warning)
  }
  return { refusals: loaded.refusals, warnings }
}
