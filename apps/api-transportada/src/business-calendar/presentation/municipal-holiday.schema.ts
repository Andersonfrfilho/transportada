/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 060 T008 / spec 238 T1.3: o contrato antigo de `/municipal-holidays` com a data civil conferida.
 * O município segue em sete dígitos (o CHECK do banco antigo): apertar para UF existente seria mudar
 * o que a rota aceita hoje, e a política recusa a cidade fora do padrão quando ela for lida.
 */
import { z } from 'zod'

import { invalidRequest, parseBody } from '../../http/request-parsing.service.js'
import type {
  MunicipalHoliday,
  MunicipalHolidayChanges,
  SaveMunicipalHolidayInput,
} from '../application/municipal-holiday.port.js'
import { toDayNumber } from '../domain/civil-date.policy.js'
import {
  civilDateSchema,
  holidayNameSchema,
  municipalKindSchema,
  requireAnyField,
} from './business-calendar-request.schema.js'

const CITY_PATTERN = /^[0-9]{7}$/u

type SaveBody = Omit<
  SaveMunicipalHolidayInput,
  'companyId' | 'correlationId' | 'ipAddress' | 'userId'
>

export type MunicipalHolidayFilters = {
  readonly cityIbgeCode?: string
  readonly from?: string
  readonly to?: string
}

const saveSchema = z
  .object({
    cityIbgeCode: z.string().regex(CITY_PATTERN),
    holidayOn: civilDateSchema,
    kind: municipalKindSchema.optional(),
    name: holidayNameSchema,
  })
  .strict()

/** A data e a cidade são a identidade da linha: editar o dia é apagar e cadastrar de novo. */
const updateSchema = z
  .object({ kind: municipalKindSchema.optional(), name: holidayNameSchema.optional() })
  .strict()
  .superRefine(requireAnyField)

export async function parseSaveHolidayBody(request: Request): Promise<SaveBody> {
  const { kind, ...fixed } = await parseBody(saveSchema, request)
  return kind === undefined ? fixed : { ...fixed, kind }
}

export async function parseUpdateHolidayBody(request: Request): Promise<MunicipalHolidayChanges> {
  const { kind, name } = await parseBody(updateSchema, request)
  return {
    ...(kind === undefined ? {} : { kind }),
    ...(name === undefined ? {} : { name }),
  }
}

export function parseHolidayFilters(request: Request): MunicipalHolidayFilters {
  const parameters = new URL(request.url).searchParams
  const cityIbgeCode = readFilter({
    key: 'cityIbgeCode',
    parameters,
    schema: z.string().regex(CITY_PATTERN),
  })
  const from = readFilter({ key: 'from', parameters, schema: civilDateSchema })
  const to = readFilter({ key: 'to', parameters, schema: civilDateSchema })
  if (from !== undefined && to !== undefined && toDayNumber(from) > toDayNumber(to)) {
    throw invalidRequest([{ field: 'from', message: 'must not be after to' }])
  }

  return {
    ...(cityIbgeCode === undefined ? {} : { cityIbgeCode }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  }
}

export function toHolidayView(holiday: MunicipalHoliday): MunicipalHoliday {
  return {
    cityIbgeCode: holiday.cityIbgeCode,
    generatedByRuleId: holiday.generatedByRuleId,
    holidayOn: holiday.holidayOn,
    id: holiday.id,
    kind: holiday.kind,
    name: holiday.name,
  }
}

function readFilter(input: {
  readonly key: string
  readonly parameters: URLSearchParams
  readonly schema: z.ZodType<string>
}): string | undefined {
  const raw = input.parameters.get(input.key)
  if (raw === null) return undefined
  const parsed = input.schema.safeParse(raw)
  if (!parsed.success) throw invalidRequest([{ field: input.key, message: 'is invalid' }])
  return parsed.data
}
