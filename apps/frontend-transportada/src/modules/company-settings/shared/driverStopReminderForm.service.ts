/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DRIVER_STOP_REMINDER_MAX_RANGES_PER_WEEKDAY,
  DRIVER_STOP_REMINDER_NUMBER_FIELDS,
  DRIVER_STOP_REMINDER_RANGE,
  type DriverStopReminderBody,
  type DriverStopReminderNumberField,
  type DriverStopReminderOperatingRange,
  type DriverStopReminderSettings,
} from './driverStopReminder.validation'

/** Domingo (0) a sábado (6): a ordem em que a tela lista os dias. */
export const DRIVER_STOP_REMINDER_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

export type DriverStopReminderDraft = Readonly<{
  enabled: boolean
  numbers: Readonly<Record<DriverStopReminderNumberField, string>>
  operatingHours: readonly DriverStopReminderOperatingRange[]
}>

export type DriverStopReminderIssue =
  | 'ranges_overlap'
  | 'start_must_precede_end'
  | 'too_many_ranges_in_weekday'

const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u
const DIGITS = /^\d+$/u
const NEW_RANGE = { end: '18:00', start: '08:00' } as const

export function startDriverStopReminderDraft(
  stored: DriverStopReminderSettings | undefined,
): DriverStopReminderDraft {
  const numbers = Object.fromEntries(
    DRIVER_STOP_REMINDER_NUMBER_FIELDS.map((field) => [field, String(stored?.[field] ?? '')]),
  ) as Record<DriverStopReminderNumberField, string>

  return {
    enabled: stored?.enabled ?? false,
    numbers,
    operatingHours: stored?.operatingHours ?? [],
  }
}

/** Só dígitos: o resto da digitação (letra, sinal, vírgula) nunca chega ao rascunho. */
export function typeDriverStopReminderNumber(text: string): string {
  return text.replace(/\D/gu, '').slice(0, 3)
}

export function isNumberFieldValid(field: DriverStopReminderNumberField, text: string): boolean {
  if (!DIGITS.test(text)) return false
  const value = Number(text)
  const range = DRIVER_STOP_REMINDER_RANGE[field]

  return value >= range.min && value <= range.max
}

export function addOperatingRange(
  ranges: readonly DriverStopReminderOperatingRange[],
  weekday: number,
): readonly DriverStopReminderOperatingRange[] {
  const count = ranges.filter((range) => range.weekday === weekday).length
  if (count >= DRIVER_STOP_REMINDER_MAX_RANGES_PER_WEEKDAY) return ranges

  return [...ranges, { ...NEW_RANGE, weekday }]
}

export function changeOperatingRange(
  ranges: readonly DriverStopReminderOperatingRange[],
  index: number,
  patch: Partial<Pick<DriverStopReminderOperatingRange, 'end' | 'start'>>,
): readonly DriverStopReminderOperatingRange[] {
  return ranges.map((range, position) => (position === index ? { ...range, ...patch } : range))
}

export function removeOperatingRange(
  ranges: readonly DriverStopReminderOperatingRange[],
  index: number,
): readonly DriverStopReminderOperatingRange[] {
  return ranges.filter((_range, position) => position !== index)
}

/** Mesmas regras do schema da API (ordem, sobreposição, no máximo três por dia); chave = posição da faixa. */
export function findOperatingHoursIssues(
  ranges: readonly DriverStopReminderOperatingRange[],
): ReadonlyMap<number, DriverStopReminderIssue> {
  const issues = new Map<number, DriverStopReminderIssue>()
  const countByWeekday = new Map<number, number>()
  const latestEndByWeekday = new Map<number, string>()

  ranges.forEach((range, index) => {
    const count = (countByWeekday.get(range.weekday) ?? 0) + 1
    countByWeekday.set(range.weekday, count)
    if (count > DRIVER_STOP_REMINDER_MAX_RANGES_PER_WEEKDAY) {
      issues.set(index, 'too_many_ranges_in_weekday')
    }
    if (!CLOCK_TIME.test(range.start) || !CLOCK_TIME.test(range.end) || range.start >= range.end) {
      issues.set(index, 'start_must_precede_end')
    }
  })

  const ordered = ranges
    .map((range, index) => ({ index, range }))
    .filter(({ index }) => issues.get(index) !== 'start_must_precede_end')
    .sort((left, right) => left.range.start.localeCompare(right.range.start))
  for (const { index, range } of ordered) {
    const latestEnd = latestEndByWeekday.get(range.weekday)
    if (latestEnd !== undefined && range.start < latestEnd && !issues.has(index)) {
      issues.set(index, 'ranges_overlap')
    }
    if (latestEnd === undefined || range.end > latestEnd) {
      latestEndByWeekday.set(range.weekday, range.end)
    }
  }

  return issues
}

/** `null` enquanto algum campo ou faixa for recusado pela API — o botão fica desligado. */
export function buildDriverStopReminderSubmission(
  draft: DriverStopReminderDraft,
): DriverStopReminderBody | null {
  const valid = DRIVER_STOP_REMINDER_NUMBER_FIELDS.every((field) =>
    isNumberFieldValid(field, draft.numbers[field]),
  )
  if (!valid || findOperatingHoursIssues(draft.operatingHours).size > 0) return null

  const numbers = Object.fromEntries(
    DRIVER_STOP_REMINDER_NUMBER_FIELDS.map((field) => [field, Number(draft.numbers[field])]),
  ) as Record<DriverStopReminderNumberField, number>

  return {
    ...numbers,
    enabled: draft.enabled,
    operatingHours: draft.operatingHours.map((range) => ({
      end: range.end,
      start: range.start,
      weekday: range.weekday,
    })),
  }
}
