/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody, parseOptionalBody, readListQuery } from '../../http/request-parsing.service.js'
import type {
  MunicipalHolidayRuleChanges,
  MunicipalHolidayRuleFields,
  MunicipalHolidayRuleRecord,
} from '../application/municipal-holiday-rule.port.js'
import type { MunicipalHolidayKind } from '../domain/business-calendar.types.js'
import {
  cityIbgeCodeSchema,
  daySchema,
  holidayNameSchema,
  monthSchema,
  municipalKindSchema,
  readCityFilter,
  refineMonthDay,
  requireAnyField,
} from './business-calendar-request.schema.js'

const LIST_QUERY_KEYS: ReadonlySet<string> = new Set(['cityIbgeCode'])

/** `.strict()`: a empresa, o ano gerado e a origem das datas não vêm do corpo. */
const createSchema = z
  .object({
    cityIbgeCode: cityIbgeCodeSchema,
    day: daySchema,
    kind: municipalKindSchema,
    month: monthSchema,
    name: holidayNameSchema,
  })
  .strict()
  .superRefine(refineMonthDay)

/** A cidade não se edita: outra cidade é outra regra. */
const updateSchema = z
  .object({
    day: daySchema.optional(),
    kind: municipalKindSchema.optional(),
    month: monthSchema.optional(),
    name: holidayNameSchema.optional(),
  })
  .strict()
  .superRefine(requireAnyField)
  .superRefine(refineMonthDay)

const materializationSchema = z.object({}).strict()

export async function parseCreateRuleBody(request: Request): Promise<MunicipalHolidayRuleFields> {
  return parseBody(createSchema, request)
}

export async function parseUpdateRuleBody(request: Request): Promise<MunicipalHolidayRuleChanges> {
  return withoutUndefined(await parseBody(updateSchema, request))
}

/** O corpo, quando vem, é recusado se trouxer qualquer campo: o horizonte é do relógio, não do cliente. */
export function parseMaterializationBody(request: Request): Promise<Record<string, never>> {
  return parseOptionalBody(materializationSchema, request)
}

export function parseRuleListQuery(request: Request): { readonly cityIbgeCode?: string } {
  const url = new URL(request.url)
  readListQuery(url, LIST_QUERY_KEYS)
  const cityIbgeCode = readCityFilter(url, 'cityIbgeCode')
  return cityIbgeCode === undefined ? {} : { cityIbgeCode }
}

/** `typedHolidaysKept` só sai onde a rota o calcula (leitura e edição); o `POST` mantém as chaves de sempre. */
export type MunicipalHolidayRuleView = {
  readonly cityIbgeCode: string
  readonly createdAt: string
  readonly day: number
  readonly id: string
  readonly kind: MunicipalHolidayKind
  readonly materializedThroughYear: number
  readonly month: number
  readonly name: string
  readonly typedHolidaysKept?: number
  readonly updatedAt: string
}

export function toRuleView(
  rule: MunicipalHolidayRuleRecord & { readonly typedHolidaysKept?: number },
): MunicipalHolidayRuleView {
  return {
    cityIbgeCode: rule.cityIbgeCode,
    createdAt: rule.createdAt.toISOString(),
    day: rule.day,
    id: rule.id,
    kind: rule.kind,
    materializedThroughYear: rule.materializedThroughYear,
    month: rule.month,
    name: rule.name,
    ...(rule.typedHolidaysKept === undefined ? {} : { typedHolidaysKept: rule.typedHolidaysKept }),
    updatedAt: rule.updatedAt.toISOString(),
  }
}

/** `exactOptionalPropertyTypes`: chave ausente e chave com `undefined` dizem coisas diferentes. */
function withoutUndefined(values: Readonly<Record<string, unknown>>): MunicipalHolidayRuleChanges {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as MunicipalHolidayRuleChanges
}
