/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'

/** Quatro casas, gêmeo de `helper_daily_rate` na ficha do motorista; negativo não casa a forma. */
const HELPER_DAILY_RATE_DECIMAL = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{4})$/

const setCrewSettingsBodySchema = z
  .object({
    helperDailyRate: z.string().regex(HELPER_DAILY_RATE_DECIMAL).nullable(),
  })
  .strict()

export function parseSetCrewSettingsBody(request: Request): Promise<{
  readonly helperDailyRate: string | null
}> {
  return parseBody(setCrewSettingsBodySchema, request)
}
