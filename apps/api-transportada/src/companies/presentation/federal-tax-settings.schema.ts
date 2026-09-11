/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { COMPANY_FEDERAL_REGIMES } from '../../database/trip-financial.schema.js'
import {
  checkFederalTaxRates,
  type FederalTaxRates,
} from '../domain/federal-tax-settings.policy.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

/** Fração decimal não negativa com até seis casas — a escala de `numeric(9, 6)`. */
const RATE_PATTERN = /^\d+(\.\d{1,6})?$/

/** `.strict()`: a empresa vem do contexto, e um `companyId` no corpo é recusado, não ignorado. */
const federalTaxSettingsSchema = z
  .object({
    cofinsRate: z.string().regex(RATE_PATTERN),
    federalRegime: z.enum(COMPANY_FEDERAL_REGIMES),
    pisRate: z.string().regex(RATE_PATTERN),
  })
  .strict()

export async function parseFederalTaxSettingsBody(request: Request): Promise<FederalTaxRates> {
  const parsed = federalTaxSettingsSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  const rates: FederalTaxRates = {
    cofinsRate: parsed.data.cofinsRate,
    federalRegime: parsed.data.federalRegime,
    pisRate: parsed.data.pisRate,
  }
  checkFederalTaxRates(rates)

  return rates
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}
