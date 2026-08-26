/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverReportedLocation } from './driverTrip.types'

/**
 * ADR-0045 §3: uma leitura por confirmação, `getCurrentPosition` e nunca `watchPosition` — a
 * coordenada é da entrega, não da pessoa.
 *
 * E a recusa **não bloqueia**: GPS desligado, sem sinal no galpão ou permissão negada devolvem
 * `null`, e a confirmação segue. Produto que exige coordenada é produto que o motorista contorna
 * anotando no papel, e aí não sobra dado nenhum.
 */
const POSITION_TIMEOUT_MS = 8_000

export function readCurrentLocation(): Promise<DriverReportedLocation | null> {
  if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          accuracyMeters: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: POSITION_TIMEOUT_MS },
    )
  })
}
