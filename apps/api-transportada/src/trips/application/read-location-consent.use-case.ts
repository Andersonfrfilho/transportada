/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { DriverNotRegisteredError } from '../domain/trip.error.js'
import type { TripLocationRepositoryPort } from './trip-location.port.js'

export type ReadLocationConsentInput = {
  readonly companyId: string
  readonly membershipId: string
}

export type ReadLocationConsentResult = { readonly acceptedAt: string | null }

/**
 * Spec 189 T7.4 (ADR-0075 §8, plan D8): a leitura que faltava ao `PUT /me/location-consent`. O
 * motorista vem do vínculo da conta autenticada, nunca do pedido; conta sem cadastro de motorista é
 * `409 DRIVER_NOT_REGISTERED`, igual ao `PUT` — configuração pendente do escritório, não "nunca
 * consentiu".
 */
export function createReadLocationConsentUseCase(dependencies: {
  readonly repository: Pick<TripLocationRepositoryPort, 'readConsent'>
  readonly resolveDriverId: (input: ReadLocationConsentInput) => Promise<string | null>
}): (input: ReadLocationConsentInput) => Promise<ReadLocationConsentResult> {
  return async (input) => {
    const driverId = await dependencies.resolveDriverId(input)
    if (driverId === null) throw new DriverNotRegisteredError()

    return dependencies.repository.readConsent({ companyId: input.companyId, driverId })
  }
}
