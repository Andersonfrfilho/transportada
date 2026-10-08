/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody, readListQuery } from '../../http/request-parsing.service.js'
import type {
  StateHolidayChanges,
  StateHolidayInput,
  StateHolidayRecord,
} from '../application/state-holiday.port.js'
import { HOLIDAY_RECURRENCE } from '../domain/business-calendar.constant.js'
import {
  civilDateSchema,
  daySchema,
  holidayNameSchema,
  monthSchema,
  readStateFilter,
  refineMonthDay,
  stateIbgeCodeSchema,
} from './business-calendar-request.schema.js'

const LIST_QUERY_KEYS: ReadonlySet<string> = new Set(['stateIbgeCode'])
const { ONCE, YEARLY } = HOLIDAY_RECURRENCE

/** Cada ramo é `.strict()`: a forma de um não entra no outro, e a empresa nunca vem do corpo. */
const createSchema = z.discriminatedUnion('recurrence', [
  z
    .object({
      holidayOn: civilDateSchema,
      name: holidayNameSchema,
      recurrence: z.literal(ONCE),
      stateIbgeCode: stateIbgeCodeSchema,
    })
    .strict(),
  z
    .object({
      day: daySchema,
      month: monthSchema,
      name: holidayNameSchema,
      recurrence: z.literal(YEARLY),
      stateIbgeCode: stateIbgeCodeSchema,
    })
    .strict()
    .superRefine(refineMonthDay),
])

/** A UF e a forma não mudam; no `yearly` mês e dia vão juntos, para a data nova se conferir inteira. */
const updateSchema = z.discriminatedUnion('recurrence', [
  z
    .object({
      holidayOn: civilDateSchema.optional(),
      name: holidayNameSchema.optional(),
      recurrence: z.literal(ONCE),
    })
    .strict()
    .superRefine(requireChange),
  z
    .object({
      day: daySchema.optional(),
      month: monthSchema.optional(),
      name: holidayNameSchema.optional(),
      recurrence: z.literal(YEARLY),
    })
    .strict()
    .superRefine(requireChange)
    .superRefine(requireMonthWithDay)
    .superRefine(refineMonthDay),
])

/** A forma sozinha não muda nada: além de `recurrence` o corpo precisa trazer um campo. */
function requireChange(value: { readonly recurrence: string }, context: z.RefinementCtx): void {
  if (Object.keys(value).some((key) => key !== 'recurrence')) return
  context.addIssue({ code: 'custom', message: 'At least one field is required' })
}

function requireMonthWithDay(
  value: { readonly day?: number | undefined; readonly month?: number | undefined },
  context: z.RefinementCtx,
): void {
  if ((value.day === undefined) === (value.month === undefined)) return
  context.addIssue({ code: 'custom', message: 'Month and day go together', path: ['month'] })
}

export function parseCreateStateHolidayBody(request: Request): Promise<StateHolidayInput> {
  return parseBody(createSchema, request)
}

export async function parseUpdateStateHolidayBody(request: Request): Promise<StateHolidayChanges> {
  return withoutUndefined(await parseBody(updateSchema, request))
}

export function parseStateHolidayListQuery(request: Request): { readonly stateIbgeCode?: string } {
  const url = new URL(request.url)
  readListQuery(url, LIST_QUERY_KEYS)
  const stateIbgeCode = readStateFilter(url, 'stateIbgeCode')
  return stateIbgeCode === undefined ? {} : { stateIbgeCode }
}

export type StateHolidayView = {
  readonly id: string
  readonly name: string
  readonly recurrence: StateHolidayRecord['recurrence']
  readonly stateIbgeCode: string
  readonly updatedAt: string
} & ({ readonly holidayOn: string } | { readonly day: number; readonly month: number })

export function toStateHolidayView(holiday: StateHolidayRecord): StateHolidayView {
  const shared = {
    id: holiday.id,
    name: holiday.name,
    recurrence: holiday.recurrence,
    stateIbgeCode: holiday.stateIbgeCode,
    updatedAt: holiday.updatedAt.toISOString(),
  }
  return holiday.recurrence === ONCE
    ? { ...shared, holidayOn: holiday.holidayOn }
    : { ...shared, day: holiday.day, month: holiday.month }
}

/** `exactOptionalPropertyTypes`: chave ausente e chave com `undefined` dizem coisas diferentes. */
function withoutUndefined(values: Readonly<Record<string, unknown>>): StateHolidayChanges {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as StateHolidayChanges
}
