/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** Sem preço de diesel (nem informado, nem da empresa, nem da ANP) o custo por km não fecha: 422. */
export function freightQuoteFuelPriceMissing(): ApiError {
  return new ApiError({
    code: 'FREIGHT_QUOTE_FUEL_PRICE_MISSING',
    message: 'No diesel price available: inform one or set it in Settings > Fuel',
    status: 422,
  })
}

/** Parâmetro que passou no formato mas não fecha a conta (por exemplo, margem de 100%). */
export function freightQuoteInputInvalid(code: string): ApiError {
  return new ApiError({
    code,
    message: 'The quote parameters do not produce a valid price',
    status: 422,
  })
}
