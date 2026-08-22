/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * Sigla bem formada que a coleta não conhece: o pedido é legível, o recurso apontado é que não
 * existe — 422, e não 400. Gravar assim mesmo daria escolha configurada e preço nenhum.
 */
export function companyEnergyDistributorUnknown(): ApiError {
  return new ApiError({
    code: 'COMPANY_ENERGY_DISTRIBUTOR_UNKNOWN',
    message: 'No published tariff names this distributor',
    status: 422,
  })
}
