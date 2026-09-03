/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { checkTrackingWindow } from '../domain/tracking-window.policy.js'
import type { TripLocationRepositoryPort } from './trip-location.port.js'

export type RecordTripLocationInput = {
  readonly companyId: string
  readonly driverId: string
  readonly latitude: string
  readonly longitude: string
  /** Injetado para o teto ser testável sem esperar trinta e seis horas. */
  readonly now?: Date
}

/**
 * `ignored` não é falha: é o que responde quando não há viagem em rua, quando o motorista não
 * consentiu, ou quando a viagem está aberta há tempo demais (ADR-0056 §2). As três respondem igual
 * **de propósito** — o app não precisa saber qual delas é, e distinguir daria ao celular um jeito
 * de perguntar "esse motorista consentiu?".
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

    /**
     * ADR-0056 §2: o teto de idade. Sem ele, a viagem que ninguém fechou na sexta acompanha o
     * motorista no fim de semana inteiro — e o `purgeByTrip`, que só roda no fechamento, nunca
     * chega para apagar isso.
     */
    const window = checkTrackingWindow({
      dispatchedAt: tracking.dispatchedAt,
      now: input.now ?? new Date(),
    })
    if (window === 'trip_too_old') return { outcome: 'ignored' }

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
