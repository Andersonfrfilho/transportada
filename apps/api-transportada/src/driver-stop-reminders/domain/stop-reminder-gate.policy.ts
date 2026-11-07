/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DRIVER_STOP_REMINDER_DEFER_REASON,
  DRIVER_STOP_REMINDER_GATE_DECISION,
  DRIVER_STOP_REMINDER_MAX_SEND_SLOT_WAIT_SECONDS,
  DRIVER_STOP_REMINDER_OPEN_QUESTION_WAIT_MINUTES,
  DRIVER_STOP_REMINDER_OPERATING_HOURS_SEARCH_DAYS,
  DRIVER_STOP_REMINDER_STAGE,
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
  MINUTES_PER_DAY,
} from './driver-stop-reminder.constant.js'
import type {
  OperatingHoursRange,
  StopReminderGateInput,
  StopReminderGateResult,
} from './driver-stop-reminder.types.js'

export type { StopReminderGateInput } from './driver-stop-reminder.types.js'

type LocalMoment = { readonly dateKey: string; readonly minutesOfDay: number }

function readLocalMoment(moment: Date, timeZone: string): LocalMoment {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(moment)
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? '0'
  return {
    dateKey: `${read('year')}-${read('month')}-${read('day')}`,
    minutesOfDay: Number(read('hour')) * 60 + Number(read('minute')),
  }
}

function parseMinutes(clock: string): number {
  const [hours = '0', minutes = '0'] = clock.split(':')
  return Number(hours) * 60 + Number(minutes)
}

function addDays(dateKey: string, days: number): { dateKey: string; weekday: number } {
  const [year = 0, month = 1, day = 1] = dateKey.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return { dateKey: shifted.toISOString().slice(0, 10), weekday: shifted.getUTCDay() }
}

function localToUtc(dateKey: string, minutesOfDay: number, timeZone: string): Date {
  const [year = 0, month = 1, day = 1] = dateKey.split('-').map(Number)
  const wallClockAsUtc = Date.UTC(year, month - 1, day, 0, minutesOfDay)
  let guess = wallClockAsUtc
  for (let pass = 0; pass < 2; pass += 1) {
    const local = readLocalMoment(new Date(guess), timeZone)
    const [localYear = 0, localMonth = 1, localDay = 1] = local.dateKey.split('-').map(Number)
    const localAsUtc = Date.UTC(localYear, localMonth - 1, localDay, 0, local.minutesOfDay)
    guess -= localAsUtc - wallClockAsUtc
  }
  return new Date(guess)
}

function rangesOfWeekday(
  operatingHours: readonly OperatingHoursRange[],
  weekday: number,
): OperatingHoursRange[] {
  return operatingHours
    .filter((range) => range.weekday === weekday)
    .sort((first, second) => parseMinutes(first.start) - parseMinutes(second.start))
}

function findNextOpening(input: StopReminderGateInput, local: LocalMoment): Date | undefined {
  for (let offset = 0; offset <= DRIVER_STOP_REMINDER_OPERATING_HOURS_SEARCH_DAYS; offset += 1) {
    const day = addDays(local.dateKey, offset)
    if (input.holidayDates.includes(day.dateKey)) continue
    const earliestStart = offset === 0 ? local.minutesOfDay : -1
    const next = rangesOfWeekday(input.operatingHours, day.weekday).find(
      (range) => parseMinutes(range.start) > earliestStart,
    )
    if (next) return localToUtc(day.dateKey, parseMinutes(next.start), input.timeZone)
  }
  return undefined
}

function isWithinOperatingHours(input: StopReminderGateInput, local: LocalMoment): boolean {
  if (input.operatingHours.length === 0) return true
  if (input.holidayDates.includes(local.dateKey)) return false
  const { weekday } = addDays(local.dateKey, 0)
  return rangesOfWeekday(input.operatingHours, weekday).some(
    (range) =>
      local.minutesOfDay >= parseMinutes(range.start) &&
      local.minutesOfDay < parseMinutes(range.end),
  )
}

function isStageComplete(input: StopReminderGateInput): boolean {
  if (input.stop.isClosed) return true
  return input.stage === DRIVER_STOP_REMINDER_STAGE.ARRIVAL && input.stop.hasArrived
}

export function decideStopReminderGate(input: StopReminderGateInput): StopReminderGateResult {
  const { now } = input
  if (isStageComplete(input)) return { decision: DRIVER_STOP_REMINDER_GATE_DECISION.CLOSE }

  const local = readLocalMoment(now, input.timeZone)
  if (!isWithinOperatingHours(input, local)) {
    const fallbackUntil = new Date(now.getTime() + MINUTES_PER_DAY * MILLISECONDS_PER_MINUTE)
    return {
      decision: DRIVER_STOP_REMINDER_GATE_DECISION.DEFER,
      reason: DRIVER_STOP_REMINDER_DEFER_REASON.OUTSIDE_OPERATING_HOURS,
      until: findNextOpening(input, local) ?? fallbackUntil,
    }
  }
  if (input.hasOpenQuestion) {
    return {
      decision: DRIVER_STOP_REMINDER_GATE_DECISION.DEFER,
      reason: DRIVER_STOP_REMINDER_DEFER_REASON.OPEN_QUESTION,
      until: new Date(
        now.getTime() + DRIVER_STOP_REMINDER_OPEN_QUESTION_WAIT_MINUTES * MILLISECONDS_PER_MINUTE,
      ),
    }
  }
  const maxSlotWaitMs = DRIVER_STOP_REMINDER_MAX_SEND_SLOT_WAIT_SECONDS * MILLISECONDS_PER_SECOND
  if (input.sendSlotAt && input.sendSlotAt.getTime() - now.getTime() > maxSlotWaitMs) {
    return {
      decision: DRIVER_STOP_REMINDER_GATE_DECISION.DEFER,
      reason: DRIVER_STOP_REMINDER_DEFER_REASON.NO_SEND_SLOT,
      until: input.sendSlotAt,
    }
  }
  return { decision: DRIVER_STOP_REMINDER_GATE_DECISION.SEND }
}
