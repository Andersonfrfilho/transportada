/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripLocationRepositoryPort } from './trip-location.port.js'

export type RecordTripLocationInput = {
  readonly companyId: string
  readonly driverId: string
  readonly latitude: string
  readonly longitude: string
}

/**
 * `ignored` não é falha: é o que responde quando não há viagem em rua ou quando o motorista não
 * consentiu. As duas respondem igual **de propósito** — o app não precisa saber qual das duas é, e
 * distinguir daria ao celular um jeito de perguntar "esse motorista consentiu?".
 */
export type RecordTripLocationResult = { readonly outcome: 'ignored' | 'recorded' }

/**
 * ADR-0050 §5: **sem consentimento não se grava.** A checagem é aqui, não na rota, porque a rota é
 * chamada por um relógio no celular e quem esquece de checar é quem escreve a próxima rota.
 */
export function createRecordTripLocationUseCase(dependencies: {
  readonly repository: TripLocationRepositoryPort
}): (input: RecordTripLocationInput) => Promise<RecordTripLocationResult> {
  return async (input) => {
    const tracking = await dependencies.repository.readCurrentTracking({
      companyId: input.companyId,
      driverId: input.driverId,
    })
    if (tracking === null || !tracking.hasConsent) return { outcome: 'ignored' }

    await dependencies.repository.recordPing({
      companyId: input.companyId,
      driverId: input.driverId,
      latitude: input.latitude,
      longitude: input.longitude,
      tripId: tracking.tripId,
    })

    return { outcome: 'recorded' }
  }
}
