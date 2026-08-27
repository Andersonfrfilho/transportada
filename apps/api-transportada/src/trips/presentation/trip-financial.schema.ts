/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { TRIP_COST_ENTRY_KINDS } from '../../database/trip-financial.schema.js'

const AMOUNT_PATTERN = /^[0-9]{1,13}(\.[0-9]{1,4})?$/u

const costSchema = z
  .object({
    amount: z.string().regex(AMOUNT_PATTERN),
    description: z.string().trim().max(200).default(''),
    kind: z.enum(TRIP_COST_ENTRY_KINDS),
  })
  .strict()

/** Recalcular um congelado exige motivo: número que muda sem explicação é pergunta sem resposta. */
const reasonSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict()

export async function parseTripCostRequest(request: Request): Promise<{
  readonly amount: string
  readonly description: string
  readonly kind: (typeof TRIP_COST_ENTRY_KINDS)[number]
}> {
  return parseBody(costSchema, request)
}

export async function parseTripFinancialReason(request: Request): Promise<string> {
  return (await parseBody(reasonSchema, request)).reason
}
