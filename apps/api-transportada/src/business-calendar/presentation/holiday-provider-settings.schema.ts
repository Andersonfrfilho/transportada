/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import {
  FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET,
  FERIADOS_API_MAX_MONTHLY_REQUEST_BUDGET,
  FERIADOS_API_MIN_MONTHLY_REQUEST_BUDGET,
} from '../../shared/holiday-provider.constant.js'
import type { HolidayProviderSettingsRecord } from '../application/holiday-provider-settings.port.js'
import { HOLIDAY_PROVIDER_TOKEN_PATTERN } from '../domain/holiday-provider-settings.constant.js'

const POSITIVE_BIGINT = /^[1-9][0-9]{0,18}$/

/** Mensagens fixas: o `400` diz o campo e a regra, nunca o valor que veio (a chave não ecoa). */
const TOKEN_MESSAGE = 'Must be 16 to 512 visible ASCII characters'
const BUDGET_MESSAGE = `Must be an integer from ${FERIADOS_API_MIN_MONTHLY_REQUEST_BUDGET} to ${FERIADOS_API_MAX_MONTHLY_REQUEST_BUDGET}`
const VERSION_MESSAGE = 'Must be a positive integer in a string'
const AT_LEAST_ONE_MESSAGE = 'Provide token, monthlyRequestBudget or both'

/**
 * `.strict()`: a instalação é única e o autor vem do contexto, então `companyId` ou qualquer campo a mais é recusado.
 * `token` é aparado antes de validar (um espaço colado ao copiar do painel do fornecedor não pode virar `400`),
 * e omiti-lo mantém o envelope selado. `expectedVersion` ausente é a intenção de criar; presente, a atualização
 * otimista (mesmo formato do `PUT /contractor-mail-settings`).
 */
const saveHolidayProviderSettingsSchema = z
  .object({
    expectedVersion: z.string().regex(POSITIVE_BIGINT, VERSION_MESSAGE).optional(),
    monthlyRequestBudget: z
      .number(BUDGET_MESSAGE)
      .int(BUDGET_MESSAGE)
      .min(FERIADOS_API_MIN_MONTHLY_REQUEST_BUDGET, BUDGET_MESSAGE)
      .max(FERIADOS_API_MAX_MONTHLY_REQUEST_BUDGET, BUDGET_MESSAGE)
      .optional(),
    token: z
      .string(TOKEN_MESSAGE)
      .trim()
      .regex(HOLIDAY_PROVIDER_TOKEN_PATTERN, TOKEN_MESSAGE)
      .optional(),
  })
  .strict()
  .refine((body) => body.token !== undefined || body.monthlyRequestBudget !== undefined, {
    message: AT_LEAST_ONE_MESSAGE,
  })

export type SaveHolidayProviderSettingsBody = {
  readonly expectedVersion: bigint | undefined
  readonly monthlyRequestBudget: number | undefined
  readonly token: string | undefined
}

export async function parseSaveHolidayProviderSettingsRequest(
  request: Request,
): Promise<SaveHolidayProviderSettingsBody> {
  const body = await parseBody(saveHolidayProviderSettingsSchema, request)
  return {
    expectedVersion: body.expectedVersion === undefined ? undefined : BigInt(body.expectedVersion),
    monthlyRequestBudget: body.monthlyRequestBudget,
    token: body.token,
  }
}

/**
 * Lista branca de campos, um a um: o registro do repositório nunca é espalhado na resposta, então um campo novo no
 * agregado só vaza se alguém o acrescentar aqui. Nunca o envelope, a chave ou quem alterou.
 */
export function toHolidayProviderSettingsView(
  record: HolidayProviderSettingsRecord | null,
): Record<string, unknown> {
  if (record === null) {
    return {
      budgetOrigin: 'default',
      monthlyRequestBudget: FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET,
      tokenConfigured: false,
      tokenHint: null,
      tokenUpdatedAt: null,
      updatedAt: null,
      version: null,
    }
  }

  return {
    budgetOrigin: 'installation',
    monthlyRequestBudget: record.monthlyRequestBudget,
    tokenConfigured: record.tokenConfigured,
    tokenHint: record.tokenHint,
    tokenUpdatedAt: record.tokenUpdatedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version.toString(),
  }
}
