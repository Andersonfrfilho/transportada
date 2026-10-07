/* Copyright (c) 2026 Ada Technology. MIT License. */
import { HOLIDAY_KIND, HOLIDAY_RECURRENCE, STATE_CODE_LENGTH } from './businessCalendar.constant'
import type {
  HolidayKind,
  HolidayRecurrence,
  MunicipalHoliday,
  MunicipalHolidayRule,
  StateHoliday,
} from './businessCalendar.types'

export type HolidayRowSource =
  | Readonly<{ origin: 'rule'; rule: MunicipalHolidayRule }>
  | Readonly<{ holiday: MunicipalHoliday; origin: 'date' }>
  | Readonly<{ holiday: StateHoliday; origin: 'state' }>

/**
 * Uma linha da tabela. A regra "todo ano" é UMA linha; as datas que ela gerou NÃO são linhas (são do roteiro, não
 * do operador — ADR-0096 §6) e só aparecem aqui as que ele digitou à mão.
 */
export type HolidayRow = Readonly<{
  /** `MM-DD-AAAA` (`0000` no "todo ano"): a ordenação por data compara texto. */
  dateKey: string
  day?: number
  holidayOn?: string
  id: string
  kind: HolidayKind
  materializedThroughYear?: number
  month?: number
  name: string
  origin: HolidayRowSource['origin']
  placeCode: string
  placeLabel: string
  recurrence: HolidayRecurrence
  source: HolidayRowSource
  stateIbgeCode: string
  typedHolidaysKept?: number
}>

type LabelOf = (code: string) => string

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dateKeyOf(input: Readonly<{ day: number; month: number; year: string }>): string {
  return `${pad(input.month)}-${pad(input.day)}-${input.year}`
}

function ruleRow(input: Readonly<{ labelOf: LabelOf; rule: MunicipalHolidayRule }>): HolidayRow {
  const { labelOf, rule } = input
  return {
    dateKey: dateKeyOf({ day: rule.day, month: rule.month, year: '0000' }),
    day: rule.day,
    id: rule.id,
    kind: rule.kind,
    materializedThroughYear: rule.materializedThroughYear,
    month: rule.month,
    name: rule.name,
    origin: 'rule',
    placeCode: rule.cityIbgeCode,
    placeLabel: labelOf(rule.cityIbgeCode),
    recurrence: HOLIDAY_RECURRENCE.YEARLY,
    source: { origin: 'rule', rule },
    stateIbgeCode: rule.cityIbgeCode.slice(0, STATE_CODE_LENGTH),
    ...(rule.typedHolidaysKept === undefined ? {} : { typedHolidaysKept: rule.typedHolidaysKept }),
  }
}

function dateKeyOfIso(holidayOn: string): string {
  const [year = '', month = '', day = ''] = holidayOn.split('-')
  return `${month}-${day}-${year}`
}

function dateRow(input: Readonly<{ holiday: MunicipalHoliday; labelOf: LabelOf }>): HolidayRow {
  const { holiday, labelOf } = input
  return {
    dateKey: dateKeyOfIso(holiday.holidayOn),
    holidayOn: holiday.holidayOn,
    id: holiday.id,
    kind: holiday.kind,
    name: holiday.name,
    origin: 'date',
    placeCode: holiday.cityIbgeCode,
    placeLabel: labelOf(holiday.cityIbgeCode),
    recurrence: HOLIDAY_RECURRENCE.ONCE,
    source: { holiday, origin: 'date' },
    stateIbgeCode: holiday.cityIbgeCode.slice(0, STATE_CODE_LENGTH),
  }
}

export function buildMunicipalRows(
  input: Readonly<{
    holidays: readonly MunicipalHoliday[]
    labelOf: LabelOf
    rules: readonly MunicipalHolidayRule[]
  }>,
): readonly HolidayRow[] {
  const { holidays, labelOf, rules } = input
  return [
    ...rules.map((rule) => ruleRow({ labelOf, rule })),
    ...holidays
      .filter((holiday) => holiday.generatedByRuleId === null)
      .map((holiday) => dateRow({ holiday, labelOf })),
  ]
}

function stateRow(input: Readonly<{ holiday: StateHoliday; labelOf: LabelOf }>): HolidayRow {
  const { holiday, labelOf } = input
  const shared = {
    id: holiday.id,
    kind: HOLIDAY_KIND.HOLIDAY,
    name: holiday.name,
    origin: 'state' as const,
    placeCode: holiday.stateIbgeCode,
    placeLabel: labelOf(holiday.stateIbgeCode),
    source: { holiday, origin: 'state' as const },
    stateIbgeCode: holiday.stateIbgeCode,
  }
  if (holiday.recurrence === HOLIDAY_RECURRENCE.ONCE) {
    return {
      ...shared,
      dateKey: dateKeyOfIso(holiday.holidayOn),
      holidayOn: holiday.holidayOn,
      recurrence: HOLIDAY_RECURRENCE.ONCE,
    }
  }
  return {
    ...shared,
    dateKey: dateKeyOf({ day: holiday.day, month: holiday.month, year: '0000' }),
    day: holiday.day,
    month: holiday.month,
    recurrence: HOLIDAY_RECURRENCE.YEARLY,
  }
}

export function buildStateRows(
  input: Readonly<{ holidays: readonly StateHoliday[]; labelOf: LabelOf }>,
): readonly HolidayRow[] {
  return input.holidays.map((holiday) => stateRow({ holiday, labelOf: input.labelOf }))
}

/** "14/07" no "todo ano" e "08/09/2026" na data fixa: o mesmo formato do seletor de data. */
export function describeHolidayDate(row: HolidayRow): string {
  if (row.recurrence === HOLIDAY_RECURRENCE.YEARLY) {
    return `${pad(row.day ?? 0)}/${pad(row.month ?? 0)}`
  }
  const [year = '', month = '', day = ''] = (row.holidayOn ?? '').split('-')
  return `${day}/${month}/${year}`
}
