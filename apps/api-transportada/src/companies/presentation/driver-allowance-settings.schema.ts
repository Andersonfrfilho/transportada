/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { MONEY_DECIMAL } from '../../shared/money.constant.js'

/** `.strict()`: a empresa vem do contexto, e `companyId`/`updatedByUserId` no corpo são recusados. */
const driverAllowanceSettingsSchema = z
  .object({
    amount: z
      .string()
      .regex(MONEY_DECIMAL)
      /** Zero não passa: o CHECK do banco exige `> 0`, e recusar aqui evita o 500 do INSERT. */
      .refine((value) => Number.parseFloat(value) > 0, { message: 'must be positive' }),
  })
  .strict()

export function parseDriverAllowanceSettingsBody(
  request: Request,
): Promise<{ readonly amount: string }> {
  return parseBody(driverAllowanceSettingsSchema, request)
}
