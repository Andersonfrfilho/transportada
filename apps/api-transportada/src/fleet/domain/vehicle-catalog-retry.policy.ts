/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { FLEET_VEHICLE_CATALOG_FAILURE, FleetVehicleCatalogFailedError } from './fleet.error.js'

const FIRST_SERVER_ERROR_STATUS = 500

/**
 * Falha que uma segunda tentativa pode resolver. Rede caída e 5xx são piscar do provedor; 4xx é
 * resposta dele sobre o pedido — repetir devolve o mesmo —, e 429 é ele pedindo para parar.
 * Corpo malformado fica de fora pelo mesmo motivo: repetir traz o mesmo corpo.
 */
export function isRetryableCatalogFailure(error: unknown): boolean {
  if (!(error instanceof FleetVehicleCatalogFailedError)) return false
  if (error.failure === FLEET_VEHICLE_CATALOG_FAILURE.TRANSPORT) return true
  if (error.failure !== FLEET_VEHICLE_CATALOG_FAILURE.PROVIDER_STATUS) return false
  return error.providerStatus !== undefined && error.providerStatus >= FIRST_SERVER_ERROR_STATUS
}
