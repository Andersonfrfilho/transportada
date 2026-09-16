/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'

/** Quatro casas, como a coluna `numeric(19,4)`. Zero não passa: o CHECK do banco exige `> 0`. */
const MONEY_DECIMAL = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{4})$/

/** `.strict()`: a empresa vem do contexto, e `companyId`/`updatedByUserId` no corpo são recusados. */
const driverAllowanceSettingsSchema = z
  .object({
    amount: z
      .string()
      .regex(MONEY_DECIMAL)
      .refine((value) => Number.parseFloat(value) > 0, { message: 'must be positive' }),
  })
  .strict()

export function parseDriverAllowanceSettingsBody(
  request: Request,
): Promise<{ readonly amount: string }> {
  return parseBody(driverAllowanceSettingsSchema, request)
}
