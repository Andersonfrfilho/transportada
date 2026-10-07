/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1: as cinco cidades do contrato em tabela. Todas as regras vão a todo calendário, de
 * propósito: quem filtra por cidade e por UF é a política, e o contrato prova que ela filtra.
 */
import { buildBusinessCalendar } from '../../src/business-calendar/domain/business-calendar.policy.js'
import type {
  BusinessCalendar,
  MunicipalHolidayRule,
  StateHolidayRule,
} from '../../src/business-calendar/domain/business-calendar.types.js'

export const TEST_CITY_IBGE_CODE = {
  beloHorizonte: '3106200',
  campinas: '3509502',
  ribeiraoPreto: '3543402',
  rioDeJaneiro: '3304557',
  saoPaulo: '3550308',
} as const

export type TestCity = keyof typeof TEST_CITY_IBGE_CODE

export const TEST_MUNICIPAL_RULES: readonly MunicipalHolidayRule[] = [
  {
    cityIbgeCode: TEST_CITY_IBGE_CODE.campinas,
    kind: 'holiday',
    name: 'Feriado municipal de Campinas',
    occurrence: { date: '2026-10-13', recurrence: 'once' },
  },
  {
    cityIbgeCode: TEST_CITY_IBGE_CODE.campinas,
    kind: 'city_anniversary',
    name: 'Aniversário de Campinas',
    occurrence: { day: 14, month: 7, recurrence: 'yearly' },
  },
  {
    cityIbgeCode: TEST_CITY_IBGE_CODE.saoPaulo,
    kind: 'city_anniversary',
    name: 'Aniversário de São Paulo',
    occurrence: { day: 25, month: 1, recurrence: 'yearly' },
  },
  {
    cityIbgeCode: TEST_CITY_IBGE_CODE.ribeiraoPreto,
    kind: 'city_anniversary',
    name: 'Aniversário de Ribeirão Preto',
    occurrence: { day: 19, month: 6, recurrence: 'yearly' },
  },
  {
    cityIbgeCode: TEST_CITY_IBGE_CODE.rioDeJaneiro,
    kind: 'holiday',
    name: 'São Sebastião',
    occurrence: { day: 20, month: 1, recurrence: 'yearly' },
  },
  // Dado inventado: o aniversário em 29/02 é o caso que prova o ano bissexto.
  {
    cityIbgeCode: TEST_CITY_IBGE_CODE.beloHorizonte,
    kind: 'city_anniversary',
    name: 'Aniversário inventado de Belo Horizonte',
    occurrence: { day: 29, month: 2, recurrence: 'yearly' },
  },
]

export const TEST_STATE_RULES: readonly StateHolidayRule[] = [
  {
    name: 'Revolução Constitucionalista',
    occurrence: { day: 9, month: 7, recurrence: 'yearly' },
    stateIbgeCode: '35',
  },
  {
    name: 'Dia de São Jorge',
    occurrence: { day: 23, month: 4, recurrence: 'yearly' },
    stateIbgeCode: '33',
  },
]

type BuildTestCalendarParams = {
  readonly city: TestCity
  readonly fromYear: number
  readonly saturdayIsBusinessDay?: boolean
}

/** Cobre o ano da data inicial e o seguinte: nenhuma conta da tabela atravessa mais que isso. */
export function buildTestCalendar({
  city,
  fromYear,
  saturdayIsBusinessDay = false,
}: BuildTestCalendarParams): BusinessCalendar {
  return buildBusinessCalendar({
    cityIbgeCode: TEST_CITY_IBGE_CODE[city],
    coverage: { fromYear, toYear: fromYear + 1 },
    municipalRules: TEST_MUNICIPAL_RULES,
    saturdayIsBusinessDay,
    stateRules: TEST_STATE_RULES,
  })
}

export function yearOf(date: string): number {
  return Number(date.slice(0, 4))
}
