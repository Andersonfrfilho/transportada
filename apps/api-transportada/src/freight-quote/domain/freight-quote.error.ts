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

/**
 * Cotação por endereço: o endereço não foi localizado com precisão de rua. Centroide de cidade erra
 * quilômetros e o preço sai errado — por isso recusa, em vez de estimar (spec 342 D2).
 */
export function freightQuoteAddressNotLocated(side: 'destination' | 'origin'): ApiError {
  return new ApiError({
    code: 'FREIGHT_QUOTE_ADDRESS_NOT_LOCATED',
    details: [{ field: side, message: 'address not located' }],
    message: 'The address could not be located precisely enough to price the freight',
    status: 422,
  })
}

/** Sem estrada medida não há distância nem pedágio: nada de reta, nada de palpite (spec 342 D3). */
export function freightQuoteRouteUnavailable(): ApiError {
  return new ApiError({
    code: 'FREIGHT_QUOTE_ROUTE_UNAVAILABLE',
    message: 'The route could not be measured right now; try again or ask the office',
    status: 503,
  })
}

/** Catálogo de praças vazio/velho ou praça sem tarifa na rota: pedágio parcial é preço falso (spec 342 D4). */
export function freightQuoteTollUnknown(): ApiError {
  return new ApiError({
    code: 'FREIGHT_QUOTE_TOLL_UNKNOWN',
    message: 'The toll cost of this route is not fully known; ask the office for a quote',
    status: 422,
  })
}
