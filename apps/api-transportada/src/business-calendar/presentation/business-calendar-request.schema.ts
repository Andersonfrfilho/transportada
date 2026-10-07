/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: os pedaços de validação que as rotas do calendário dividem. A data civil passa por
 * `parseCivilDate`, a mesma da política: `2026-02-30` morre aqui com 400, não no Postgres.
 */
import { z } from 'zod'

import { invalidRequest } from '../../http/request-parsing.service.js'
import {
  BRAZILIAN_STATE_IBGE_CODES,
  CITY_IBGE_CODE_PATTERN,
} from '../domain/business-calendar.constant.js'
import { BusinessCalendarError } from '../domain/business-calendar.error.js'
import { isValidMonthDay, parseCivilDate } from '../domain/civil-date.policy.js'
import {
  BRAZILIAN_STATE_IBGE_CODE_LIST,
  HOLIDAY_NAME_MAX_LENGTH,
  MUNICIPAL_HOLIDAY_KINDS,
} from '../../shared/business-calendar.constant.js'

const MAX_DAY = 31
const MONTHS_IN_YEAR = 12

export const civilDateSchema = z.string().transform((value, context) => {
  try {
    return parseCivilDate(value)
  } catch (error) {
    if (!(error instanceof BusinessCalendarError)) throw error
    context.addIssue({ code: 'custom', message: error.message })
    return z.NEVER
  }
})

/** Município IBGE de UF existente: sete dígitos que o calendário saberia resolver. */
export const cityIbgeCodeSchema = z
  .string()
  .regex(CITY_IBGE_CODE_PATTERN)
  .refine((code) => BRAZILIAN_STATE_IBGE_CODES.has(code.slice(0, 2)), 'unknown state')

export const stateIbgeCodeSchema = z.enum(BRAZILIAN_STATE_IBGE_CODE_LIST)

export const holidayNameSchema = z.string().trim().min(1).max(HOLIDAY_NAME_MAX_LENGTH)

export const municipalKindSchema = z.enum(MUNICIPAL_HOLIDAY_KINDS)

export const monthSchema = z.number().int().min(1).max(MONTHS_IN_YEAR)

export const daySchema = z.number().int().min(1).max(MAX_DAY)

/** Mês e dia se conferem juntos: 29/02 vale (existe nos bissextos), 31/04 e 30/02 não. */
export function refineMonthDay(
  value: { readonly day?: number | undefined; readonly month?: number | undefined },
  context: z.RefinementCtx,
): void {
  if (value.day === undefined || value.month === undefined) return
  if (isValidMonthDay({ day: value.day, month: value.month })) return
  context.addIssue({
    code: 'custom',
    message: 'The day does not exist in the month',
    path: ['day'],
  })
}

/** `PATCH` sem nenhum campo não muda nada: é pedido mal formado, não no-op. */
export function requireAnyField(value: object, context: z.RefinementCtx): void {
  if (Object.keys(value).length > 0) return
  context.addIssue({ code: 'custom', message: 'At least one field is required' })
}

export function readCityFilter(url: URL, key: string): string | undefined {
  return readFilter({ key, schema: cityIbgeCodeSchema, url })
}

export function readStateFilter(url: URL, key: string): string | undefined {
  return readFilter({ key, schema: stateIbgeCodeSchema, url })
}

function readFilter(input: {
  readonly key: string
  readonly schema: z.ZodType<string>
  readonly url: URL
}): string | undefined {
  const raw = input.url.searchParams.get(input.key)
  if (raw === null) return undefined
  const parsed = input.schema.safeParse(raw)
  if (!parsed.success) throw invalidRequest([{ field: input.key, message: 'is invalid' }])
  return parsed.data
}
