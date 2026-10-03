/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/driverLocation.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { clampProofAccuracyMeters } from './driverTripClient.service'
import type { DriverFieldReport, DriverReportedLocation } from './driverTrip.types'

/**
 * ADR-0045 §3: uma leitura por confirmação; posição contínua só com consentimento (ADR-0050 §5,
 * ADR-0075 §8). Aqui é `getCurrentPosition` — a coordenada é da entrega, não da pessoa; o
 * `watchPosition` do rastreamento mora em `locationSharing.service.ts`, atrás do interruptor.
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

/**
 * Spec 196 D5: o toque direto não tem gravação local para fazer antes — espera a posição, mas com
 * um relógio da própria app. O `timeout` da Geolocation API só conta depois da permissão, e o
 * primeiro pedido de permissão seguraria o botão indefinidamente. Rede e leitura de até 5 min
 * bastam para "saiu do pátio"; esgotado o relógio, o `POST` sai com `location: null`.
 */
export const DIRECT_TAP_POSITION_BUDGET_MS = 3_000
export const DIRECT_TAP_POSITION_MAX_AGE_MS = 300_000

/**
 * "Despachar" e "Iniciar rota" (spec 196 RF8) seguem saindo em até 3 s, com ou sem posição. Desde as
 * specs 230 e 206 eles são itens da fila, e a fila espera a leitura de 8 s (sem prazo nenhum, com o
 * pedido de permissão aberto) antes de pedir a drenagem — então são eles que usam a leitura com relógio.
 */
export function usesDirectTapLocation(reports: readonly DriverFieldReport[]): boolean {
  return (
    reports.length > 0 &&
    reports.every((report) => report.kind === 'dispatch' || report.kind === 'depart')
  )
}

type CancelTimer = () => void
type StartTimer = (callback: () => void, milliseconds: number) => CancelTimer

function startBrowserTimer(callback: () => void, milliseconds: number): CancelTimer {
  const handle = setTimeout(callback, milliseconds)
  return () => clearTimeout(handle)
}

export function readDirectTapLocation(
  input: {
    readonly geolocation?: Geolocation | undefined
    readonly timer?: StartTimer
  } = {},
): Promise<DriverReportedLocation | null> {
  const geolocation =
    'geolocation' in input
      ? input.geolocation
      : typeof navigator === 'undefined'
        ? undefined
        : navigator.geolocation
  if (geolocation === undefined) return Promise.resolve(null)
  const startTimer = input.timer ?? startBrowserTimer

  return new Promise((resolve) => {
    const cancelTimer = startTimer(() => resolve(null), DIRECT_TAP_POSITION_BUDGET_MS)
    geolocation.getCurrentPosition(
      (position) => {
        cancelTimer()
        const accuracyMeters = clampProofAccuracyMeters(position.coords.accuracy)
        resolve({
          ...(accuracyMeters === undefined ? {} : { accuracyMeters }),
          capturedAt: new Date(position.timestamp).toISOString(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      () => {
        cancelTimer()
        resolve(null)
      },
      { enableHighAccuracy: false, maximumAge: DIRECT_TAP_POSITION_MAX_AGE_MS },
    )
  })
}
