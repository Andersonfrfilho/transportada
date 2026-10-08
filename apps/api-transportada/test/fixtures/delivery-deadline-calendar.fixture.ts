/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.1: os quatro calendários do contrato do prazo de entrega, cobertura 2024–2028. BH só tem
 * feriado nacional (sem regra municipal, ao contrário da fixture da 238, que inventa um 29/02).
 */
import { buildBusinessCalendar } from '../../src/business-calendar/domain/business-calendar.policy.js'
import type {
  BusinessCalendar,
  MunicipalHolidayRule,
  StateHolidayRule,
} from '../../src/business-calendar/domain/business-calendar.types.js'

export const DEADLINE_CITY = {
  BELO_HORIZONTE: 'beloHorizonte',
  CAMPINAS: 'campinas',
  CAMPINAS_WITH_SATURDAY: 'campinasWithSaturday',
  SAO_PAULO: 'saoPaulo',
} as const

export type DeadlineCity = (typeof DEADLINE_CITY)[keyof typeof DEADLINE_CITY]

const IBGE_CODE = {
  beloHorizonte: '3106200',
  campinas: '3509502',
  saoPaulo: '3550308',
} as const

const STATE_RULES: readonly StateHolidayRule[] = [
  {
    name: 'Revolução Constitucionalista',
    occurrence: { day: 9, month: 7, recurrence: 'yearly' },
    stateIbgeCode: '35',
  },
]

const MUNICIPAL_RULES: readonly MunicipalHolidayRule[] = [
  {
    cityIbgeCode: IBGE_CODE.saoPaulo,
    kind: 'city_anniversary',
    name: 'Aniversário de São Paulo',
    occurrence: { day: 25, month: 1, recurrence: 'yearly' },
  },
  {
    cityIbgeCode: IBGE_CODE.campinas,
    kind: 'city_anniversary',
    name: 'Aniversário de Campinas',
    occurrence: { day: 14, month: 7, recurrence: 'yearly' },
  },
  {
    cityIbgeCode: IBGE_CODE.campinas,
    kind: 'holiday',
    name: 'Feriado único de Campinas',
    occurrence: { date: '2026-10-13', recurrence: 'once' },
  },
]

type BuildDeadlineCalendarParams = {
  readonly cityIbgeCode: string
  readonly saturdayIsBusinessDay: boolean
}

function buildDeadlineCalendar({
  cityIbgeCode,
  saturdayIsBusinessDay,
}: BuildDeadlineCalendarParams): BusinessCalendar {
  return buildBusinessCalendar({
    cityIbgeCode,
    coverage: { fromYear: 2024, toYear: 2028 },
    municipalRules: MUNICIPAL_RULES,
    saturdayIsBusinessDay,
    stateRules: STATE_RULES,
  })
}

/** Todas as regras vão a todo calendário: quem filtra por cidade e UF é a política da 238. */
export const DEADLINE_CALENDARS: Readonly<Record<DeadlineCity, BusinessCalendar>> = {
  beloHorizonte: buildDeadlineCalendar({
    cityIbgeCode: IBGE_CODE.beloHorizonte,
    saturdayIsBusinessDay: false,
  }),
  campinas: buildDeadlineCalendar({
    cityIbgeCode: IBGE_CODE.campinas,
    saturdayIsBusinessDay: false,
  }),
  campinasWithSaturday: buildDeadlineCalendar({
    cityIbgeCode: IBGE_CODE.campinas,
    saturdayIsBusinessDay: true,
  }),
  saoPaulo: buildDeadlineCalendar({
    cityIbgeCode: IBGE_CODE.saoPaulo,
    saturdayIsBusinessDay: false,
  }),
}
