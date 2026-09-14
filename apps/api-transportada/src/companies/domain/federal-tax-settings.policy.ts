/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyFederalRegime } from '../../database/trip-financial.schema.js'
import { PERCENTAGE_SCALE, parseScaledDecimal } from '../../shared/decimal.service.js'
import { ApiError } from '../../shared/api.error.js'
import type { ApiErrorDetail } from '../../shared/api.types.js'

const ERROR_CODE_PREFIX = 'COMPANY_FEDERAL_TAX'

/**
 * Spec 126 regra 2: **teto de sanidade de 20%.** A maior alíquota federal comum aqui é 7,6% (COFINS
 * não cumulativa, Lei 10.833/2003). O teto não é regra fiscal: ele recusa o erro de unidade — `0.65`
 * é o percentual digitado onde se espera a fração, e a conta multiplicaria o imposto por cem.
 */
const RATE_CEILING = parseRate('0.2')

export type FederalTaxRates = {
  readonly cofinsRate: string
  readonly federalRegime: CompanyFederalRegime
  readonly pisRate: string
}

/**
 * Recusa o que a conta não pode usar, e diz **todos** os campos de uma vez. No Simples Nacional PIS
 * e COFINS estão dentro do DAS: não há alíquota própria a descontar da margem, e só zero entra.
 */
export function checkFederalTaxRates(rates: FederalTaxRates): void {
  const fields = [
    ['cofinsRate', rates.cofinsRate],
    ['pisRate', rates.pisRate],
  ] as const

  const outOfRange: ApiErrorDetail[] = fields
    .filter(([, value]) => parseRate(value) > RATE_CEILING)
    .map(([field]) => ({ field, message: 'rate must be a fraction up to 0.2' }))
  if (outOfRange.length > 0) {
    throw new ApiError({
      code: 'COMPANY_FEDERAL_TAX_RATE_OUT_OF_RANGE',
      details: outOfRange,
      message: 'Federal tax rate is a fraction (0.0065 for 0.65%) and cannot exceed 0.2',
      status: 422,
    })
  }

  if (rates.federalRegime !== 'simple') return
  const nonZero: ApiErrorDetail[] = fields
    .filter(([, value]) => parseRate(value) !== 0n)
    .map(([field]) => ({ field, message: 'simple regime pays PIS/COFINS inside the DAS' }))
  if (nonZero.length > 0) {
    throw new ApiError({
      code: 'COMPANY_FEDERAL_TAX_SIMPLE_NOT_ZERO',
      details: nonZero,
      message: 'Simples Nacional records zero: PIS and COFINS are paid inside the DAS',
      status: 422,
    })
  }
}

function parseRate(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: PERCENTAGE_SCALE, value })
}
