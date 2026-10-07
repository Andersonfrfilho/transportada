/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3 (ADR-0096 §5): a regra "todo ano" vira uma data fixa por ano em `municipal_holidays`,
 * que é o que o roteirizador lê. A conta é pura; o ano corrente vem do relógio injetado pelo caso de
 * uso, no fuso de São Paulo.
 */
import {
  BUSINESS_CALENDAR_TIME_ZONE,
  MUNICIPAL_HOLIDAY_MATERIALIZATION_YEARS,
} from '../domain/business-calendar.constant.js'
import type { CivilDate } from '../domain/business-calendar.types.js'
import { daysInMonth, formatCivilDate } from '../domain/civil-date.policy.js'
import { toCivilDate } from './civil-date.service.js'

type MaterializationParams = {
  readonly day: number
  readonly fromYear: number
  readonly month: number
  readonly toYear: number
}

export type MaterializationYears = {
  readonly fromYear: number
  readonly toYear: number
}

/** 29/02 só existe nos anos bissextos: nos outros a regra não gera nada, nunca 28/02 nem 01/03. */
export function listMaterializationDates({
  day,
  fromYear,
  month,
  toYear,
}: MaterializationParams): readonly CivilDate[] {
  const dates: CivilDate[] = []
  for (let year = fromYear; year <= toYear; year += 1) {
    if (day <= daysInMonth({ month, year })) dates.push(formatCivilDate({ day, month, year }))
  }
  return dates
}

export function resolveCurrentYear({ now }: { readonly now: Date }): number {
  return Number(toCivilDate({ instant: now, timeZone: BUSINESS_CALENDAR_TIME_ZONE }).slice(0, 4))
}

export function buildMaterializationYears({
  currentYear,
}: {
  readonly currentYear: number
}): MaterializationYears {
  return { fromYear: currentYear, toYear: currentYear + MUNICIPAL_HOLIDAY_MATERIALIZATION_YEARS }
}

export function resolveMaterializationYears({ now }: { readonly now: Date }): MaterializationYears {
  return buildMaterializationYears({ currentYear: resolveCurrentYear({ now }) })
}
