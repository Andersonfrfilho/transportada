/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  BRAZILIAN_STATES,
  CITY_IBGE_CODE_PATTERN,
  DAY_INPUT_MAX_LENGTH,
  HOLIDAY_NAME_MAX_LENGTH,
  HOLIDAY_RECURRENCE,
  MONTHS_IN_YEAR,
  STATE_CODE_LENGTH,
} from './businessCalendar.constant'
import type { HolidayKind, HolidayRecurrence } from './businessCalendar.types'

export type HolidayField =
  | 'cityIbgeCode'
  | 'day'
  | 'holidayOn'
  | 'kind'
  | 'month'
  | 'name'
  | 'recurrence'
  | 'stateIbgeCode'

/** A ordem de tela dos campos: é nela que o aviso de recusa os lista e o foco procura. */
export const HOLIDAY_FIELD_ORDER: readonly HolidayField[] = [
  'stateIbgeCode',
  'cityIbgeCode',
  'kind',
  'recurrence',
  'month',
  'day',
  'holidayOn',
  'name',
]

export type HolidayIssue = 'dayNotInMonth' | 'invalid' | 'required' | 'tooLong'
export type HolidayIssues = Readonly<Partial<Record<HolidayField, HolidayIssue>>>
export type HolidayScope = 'municipal' | 'state'

/** Tudo em texto, como o formulário digita; a conversão para número e data é do `Submission`. */
export type HolidayDraft = Readonly<{
  cityIbgeCode: string
  day: string
  holidayOn: string
  kind: HolidayKind | ''
  month: string
  name: string
  recurrence: HolidayRecurrence | ''
  stateIbgeCode: string
}>

export const EMPTY_HOLIDAY_DRAFT: HolidayDraft = {
  cityIbgeCode: '',
  day: '',
  holidayOn: '',
  kind: '',
  month: '',
  name: '',
  recurrence: '',
  stateIbgeCode: '',
}

/** Fevereiro com 29: o dia existe nos anos bissextos, e a API gera só neles. */
const LAST_DAY_OF_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const
const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u

export function isDayInMonth(input: Readonly<{ day: number; month: number }>): boolean {
  const { day, month } = input
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false
  if (month < 1 || month > MONTHS_IN_YEAR) return false
  return day >= 1 && day <= (LAST_DAY_OF_MONTH[month - 1] ?? 0)
}

export function maskDayInput(value: string): string {
  return value.replace(/\D/gu, '').slice(0, DAY_INPUT_MAX_LENGTH)
}

function isCivilDate(value: string): boolean {
  const match = CIVIL_DATE_PATTERN.exec(value)
  if (match === null) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

function isKnownState(code: string): boolean {
  return BRAZILIAN_STATES.some((state) => state.code === code)
}

function validateState(stateIbgeCode: string): HolidayIssues {
  if (stateIbgeCode === '') return { stateIbgeCode: 'required' }
  return isKnownState(stateIbgeCode) ? {} : { stateIbgeCode: 'invalid' }
}

function validateCity(cityIbgeCode: string): HolidayIssues {
  if (cityIbgeCode === '') return { cityIbgeCode: 'required' }
  const isCity =
    CITY_IBGE_CODE_PATTERN.test(cityIbgeCode) &&
    isKnownState(cityIbgeCode.slice(0, STATE_CODE_LENGTH))
  return isCity ? {} : { cityIbgeCode: 'invalid' }
}

function validatePlace(
  input: Readonly<{ draft: HolidayDraft; scope: HolidayScope }>,
): HolidayIssues {
  const { draft, scope } = input
  const state = validateState(draft.stateIbgeCode)
  return scope === 'state' ? state : { ...state, ...validateCity(draft.cityIbgeCode) }
}

function validateWhen(draft: HolidayDraft): HolidayIssues {
  if (draft.recurrence === '') return { recurrence: 'required' }
  if (draft.recurrence === HOLIDAY_RECURRENCE.ONCE) {
    if (draft.holidayOn === '') return { holidayOn: 'required' }
    return isCivilDate(draft.holidayOn) ? {} : { holidayOn: 'invalid' }
  }
  const [month, day] = [Number(draft.month), Number(draft.day)]
  const issues: Partial<Record<HolidayField, HolidayIssue>> = {}
  if (draft.month === '') issues.month = 'required'
  if (draft.day === '') issues.day = 'required'
  if (draft.month !== '' && draft.day !== '' && !isDayInMonth({ day, month })) {
    issues.day = 'dayNotInMonth'
  }
  return issues
}

function validateName(name: string): HolidayIssues {
  const trimmed = name.trim()
  if (trimmed === '') return { name: 'required' }
  return trimmed.length > HOLIDAY_NAME_MAX_LENGTH ? { name: 'tooLong' } : {}
}

/** Todas as pendências de uma vez, nunca a primeira: corrigir não pode ser tentativa e erro. */
export function validateHolidayDraft(
  input: Readonly<{ draft: HolidayDraft; scope: HolidayScope }>,
): HolidayIssues {
  const { draft, scope } = input
  return {
    ...validatePlace({ draft, scope }),
    ...(scope === 'municipal' && draft.kind === '' ? { kind: 'required' as const } : {}),
    ...validateWhen(draft),
    ...validateName(draft.name),
  }
}
