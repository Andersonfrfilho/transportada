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
  SaveMunicipalHolidayResult,
} from '../application/municipal-holiday.port.js'
import { toDayNumber } from '../domain/civil-date.policy.js'
import { LEGACY_CITY_IBGE_CODE_PATTERN } from '../domain/business-calendar.constant.js'
import {
  civilDateSchema,
  holidayNameSchema,
  municipalKindSchema,
  readFilter,
  requireAnyField,
} from './business-calendar-request.schema.js'

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
    cityIbgeCode: z.string().regex(LEGACY_CITY_IBGE_CODE_PATTERN),
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
  const url = new URL(request.url)
  const cityIbgeCode = readFilter({
    key: 'cityIbgeCode',
    schema: z.string().regex(LEGACY_CITY_IBGE_CODE_PATTERN),
    url,
  })
  const from = readFilter({ key: 'from', schema: civilDateSchema, url })
  const to = readFilter({ key: 'to', schema: civilDateSchema, url })
  if (from !== undefined && to !== undefined && toDayNumber(from) > toDayNumber(to)) {
    throw invalidRequest([{ field: 'from', message: 'must not be after to' }])
  }

  return {
    ...(cityIbgeCode === undefined ? {} : { cityIbgeCode }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  }
}

export type SavedHolidayView = MunicipalHoliday & { readonly adoptedFromRuleId: string | null }

export function toSavedHolidayView(saved: SaveMunicipalHolidayResult): SavedHolidayView {
  return { ...toHolidayView(saved.holiday), adoptedFromRuleId: saved.adoptedFromRuleId }
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
