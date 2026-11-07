/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { DRIVER_STOP_REMINDER_SETTINGS_RANGE as RANGE } from '../domain/driver-stop-reminder.constant.js'

const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/

type Range = { readonly end: string; readonly start: string; readonly weekday: number }

function boundedInteger(range: { readonly min: number; readonly max: number }): z.ZodNumber {
  return z.number().int().min(range.min).max(range.max)
}

const operatingRangeSchema = z
  .object({
    end: z.string().regex(CLOCK_TIME),
    start: z.string().regex(CLOCK_TIME),
    weekday: boundedInteger(RANGE.WEEKDAY),
  })
  .strict()

function hasClockTimes(range: Range): boolean {
  return CLOCK_TIME.test(range.start) && CLOCK_TIME.test(range.end)
}

function addOrderIssues(ranges: readonly Range[], context: z.RefinementCtx): void {
  ranges.forEach((range, index) => {
    if (!hasClockTimes(range) || range.start < range.end) return
    context.addIssue({ code: 'custom', message: 'start_must_precede_end', path: [index, 'end'] })
  })
}

function addOverlapIssues(ranges: readonly Range[], context: z.RefinementCtx): void {
  const latestEndByWeekday = new Map<number, string>()
  const ordered = ranges
    .map((range, index) => ({ index, range }))
    .filter(({ range }) => hasClockTimes(range) && range.start < range.end)
    .sort((left, right) => left.range.start.localeCompare(right.range.start))
  for (const { index, range } of ordered) {
    const latestEnd = latestEndByWeekday.get(range.weekday)
    if (latestEnd !== undefined && range.start < latestEnd) {
      context.addIssue({ code: 'custom', message: 'ranges_overlap', path: [index, 'start'] })
    }
    latestEndByWeekday.set(
      range.weekday,
      latestEnd === undefined || range.end > latestEnd ? range.end : latestEnd,
    )
  }
}

function addCountIssues(ranges: readonly Range[], context: z.RefinementCtx): void {
  const countByWeekday = new Map<number, number>()
  for (const range of ranges) {
    countByWeekday.set(range.weekday, (countByWeekday.get(range.weekday) ?? 0) + 1)
  }
  const isOverLimit = [...countByWeekday.values()].some(
    (count) => count > RANGE.MAX_OPERATING_RANGES_PER_WEEKDAY,
  )
  if (isOverLimit)
    context.addIssue({ code: 'custom', message: 'too_many_ranges_in_weekday', path: [] })
}

const operatingHoursSchema = z.array(operatingRangeSchema).superRefine((ranges, context) => {
  addOrderIssues(ranges, context)
  addOverlapIssues(ranges, context)
  addCountIssues(ranges, context)
})

/** `.strict()`: a empresa vem do contexto; `companyId` ou qualquer campo extra no corpo é recusado. */
export const driverStopReminderSettingsSchema = z
  .object({
    dwellMinutes: boundedInteger(RANGE.DWELL_MINUTES),
    enabled: z.boolean(),
    graceMinMinutes: boundedInteger(RANGE.GRACE_MIN_MINUTES),
    gracePercent: boundedInteger(RANGE.GRACE_PERCENT),
    intervalMinutes: boundedInteger(RANGE.INTERVAL_MINUTES),
    maxAttempts: boundedInteger(RANGE.MAX_ATTEMPTS),
    operatingHours: operatingHoursSchema,
  })
  .strict()
