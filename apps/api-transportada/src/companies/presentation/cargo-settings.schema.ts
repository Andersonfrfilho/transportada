/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'

/** Quatro casas, como o peso do volume no banco; zero não passa — nulo é que desliga a estimativa. */
const WEIGHT_DECIMAL = /^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{4})$/

const setDefaultVolumeWeightBodySchema = z
  .object({
    defaultVolumeWeight: z
      .string()
      .regex(WEIGHT_DECIMAL)
      .refine((value) => Number.parseFloat(value) > 0, { message: 'must be positive' }),
  })
  .strict()

export function parseSetDefaultVolumeWeightBody(request: Request): Promise<{
  readonly defaultVolumeWeight: string
}> {
  return parseBody(setDefaultVolumeWeightBodySchema, request)
}
