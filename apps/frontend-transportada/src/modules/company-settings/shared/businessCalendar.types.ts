/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  HOLIDAY_KINDS,
  HOLIDAY_ORIGINS,
  HOLIDAY_RECURRENCES,
  SETTINGS_ORIGINS,
} from './businessCalendar.constant'

export type HolidayKind = (typeof HOLIDAY_KINDS)[number]
export type HolidayOrigin = (typeof HOLIDAY_ORIGINS)[number]
export type HolidayRecurrence = (typeof HOLIDAY_RECURRENCES)[number]

/** Sem linha gravada é resposta válida (padrão do sistema: segunda a sexta, `origin: 'default'`). */
export type BusinessCalendarSettings = Readonly<{
  origin: (typeof SETTINGS_ORIGINS)[number]
  saturdayIsBusinessDay: boolean
  updatedAt: string | null
}>

/** `typedHolidaysKept` só chega onde a rota o calcula (leitura e edição); o `POST` não o manda. */
export type MunicipalHolidayRule = Readonly<{
  cityIbgeCode: string
  createdAt: string
  day: number
  id: string
  kind: HolidayKind
  materializedThroughYear: number
  month: number
  name: string
  typedHolidaysKept?: number
  updatedAt: string
}>

/**
 * `generatedByRuleId` nulo é a data digitada à mão; preenchido, só a regra a muda. `origin` diz se a data é do
 * operador ou da FeriadosAPI: opcional, porque a API que o painel encontra pode ainda não mandá-lo (spec 252).
 */
export type MunicipalHoliday = Readonly<{
  cityIbgeCode: string
  generatedByRuleId: string | null
  holidayOn: string
  id: string
  kind: HolidayKind
  name: string
  origin?: HolidayOrigin
}>

/** `adoptedFromRuleId` preenchido: a data era gerada por essa regra e passou a ser do operador. */
export type SavedMunicipalHoliday = MunicipalHoliday &
  Readonly<{ adoptedFromRuleId: string | null }>

type StateHolidayBase = Readonly<{
  id: string
  name: string
  origin?: HolidayOrigin
  stateIbgeCode: string
  updatedAt: string
}>

export type StateHoliday = StateHolidayBase &
  (
    | Readonly<{ holidayOn: string; recurrence: 'once' }>
    | Readonly<{ day: number; month: number; recurrence: 'yearly' }>
  )

export type MaterializationSummary = Readonly<{ holidaysCreated: number; rulesProcessed: number }>

export type MunicipalRuleFields = Readonly<{
  cityIbgeCode: string
  day: number
  kind: HolidayKind
  month: number
  name: string
}>

/** A cidade não se edita: outra cidade é outra regra. */
export type MunicipalRuleChanges = Readonly<{
  day?: number
  kind?: HolidayKind
  month?: number
  name?: string
}>

export type MunicipalHolidayFields = Readonly<{
  cityIbgeCode: string
  holidayOn: string
  kind: HolidayKind
  name: string
}>

/** A data e a cidade são a identidade da linha: editar o dia é apagar e cadastrar de novo. */
export type MunicipalHolidayChanges = Readonly<{ kind?: HolidayKind; name?: string }>

export type StateHolidayFields =
  | Readonly<{ holidayOn: string; name: string; recurrence: 'once'; stateIbgeCode: string }>
  | Readonly<{
      day: number
      month: number
      name: string
      recurrence: 'yearly'
      stateIbgeCode: string
    }>

/** O `PATCH` leva sempre a recorrência; no "todo ano" mês e dia vão juntos. */
export type StateHolidayChanges =
  | Readonly<{ holidayOn?: string; name?: string; recurrence: 'once' }>
  | Readonly<{ day?: number; month?: number; name?: string; recurrence: 'yearly' }>
