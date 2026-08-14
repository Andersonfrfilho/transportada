/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { buildTaxIdSchema } from '../../shared/tax-id.schema.js'
import { CNPJ_PATTERN } from '../../shared/tax-id.service.js'
import { parseFreightJsonBody } from './freight.schema.js'

const MONEY_DECIMAL = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{4})$/
const PERCENTAGE_DECIMAL = /^(?:0|0\.[0-9]{6}|1|1\.000000)$/
const RULE_VERSION = /^(?:0|[1-9][0-9]{0,18})$/
const STATE_CODE = /^[A-Za-z]{2}$/

const filtersSchema = z
  .object({
    destinationStates: z.array(z.string().trim().regex(STATE_CODE)).max(27).optional(),
    senderTaxIds: z.array(buildTaxIdSchema(CNPJ_PATTERN)).max(200).optional(),
  })
  .strict()

const updateFreightRuleSchema = z
  .object({
    expectedCurrentVersion: z.string().regex(RULE_VERSION),
    filters: filtersSchema.optional(),
    maximumAmount: z.string().regex(MONEY_DECIMAL).nullable(),
    minimumAmount: z.string().regex(MONEY_DECIMAL).nullable(),
    percentage: z.string().regex(PERCENTAGE_DECIMAL),
    validFrom: z.iso.datetime(),
    validUntil: z.iso.datetime().nullable(),
  })
  .strict()

const changeFreightRuleStatusSchema = z
  .object({
    status: z.enum(['active', 'inactive']),
  })
  .strict()

export type FreightRuleMutationFilters = {
  readonly destinationStates: readonly string[]
  readonly senderTaxIds: readonly string[]
}

export async function parseUpdateFreightRuleRequest(request: Request): Promise<{
  readonly expectedCurrentVersion: string
  readonly filters: FreightRuleMutationFilters
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly percentage: string
  readonly validFrom: string
  readonly validUntil: string | null
}> {
  const result = updateFreightRuleSchema.safeParse(await parseFreightJsonBody(request))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  const { filters, ...payload } = result.data
  return {
    ...payload,
    filters: {
      destinationStates: normalizeCodes(filters?.destinationStates),
      senderTaxIds: normalizeCodes(filters?.senderTaxIds),
    },
  }
}

export async function parseChangeFreightRuleStatusRequest(
  request: Request,
): Promise<{ readonly status: 'active' | 'inactive' }> {
  const result = changeFreightRuleStatusSchema.safeParse(await parseFreightJsonBody(request))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}

function normalizeCodes(values: readonly string[] | undefined): readonly string[] {
  if (values === undefined) return []
  return [...new Set(values.map((value) => value.toUpperCase()))].sort()
}
