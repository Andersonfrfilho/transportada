/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6): o corpo do `POST /business-calendar/day-checks` — até 200 pares cidade e data, tudo
 * `.strict()` (a empresa nunca vem do corpo) — e a visão do aviso, que é o formato único que o painel e o
 * app do motorista já validam.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import type { DayCheckItem } from '../application/day-checks.use-case.js'
import type { HolidayWarning } from '../domain/holiday-warning.policy.js'
import { cityIbgeCodeSchema, civilDateSchema } from './business-calendar-request.schema.js'

export const DAY_CHECKS_MAX_ITEMS = 200

const itemSchema = z.object({ cityIbgeCode: cityIbgeCodeSchema, date: civilDateSchema }).strict()

const bodySchema = z
  .object({ items: z.array(itemSchema).min(1).max(DAY_CHECKS_MAX_ITEMS) })
  .strict()

export async function parseDayChecksBody(
  request: Request,
): Promise<{ readonly items: readonly DayCheckItem[] }> {
  return parseBody(bodySchema, request)
}

export type HolidayWarningView = {
  readonly cityIbgeCode: number
  readonly cityName?: string
  readonly date: string
  readonly reasons: readonly {
    readonly name: string
    readonly origin: string
    readonly scope: string
  }[]
}

/** Lista branca: o aviso sai com os campos do formato e nenhum a mais. */
export function toHolidayWarningView(warning: HolidayWarning): HolidayWarningView {
  return {
    cityIbgeCode: warning.cityIbgeCode,
    ...(warning.cityName === undefined ? {} : { cityName: warning.cityName }),
    date: warning.date,
    reasons: warning.reasons.map(({ name, origin, scope }) => ({ name, origin, scope })),
  }
}
