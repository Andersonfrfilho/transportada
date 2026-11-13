/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 (trajeto da viagem no pagamento): a viagem não tem número nem nome de trajeto. O trajeto sai, na leitura,
 * do rótulo da primeira e da última parada (`RUA X, 12, SAO CARLOS, SP`, `buildStopLabel`): cidade e UF, nunca a
 * rua. Nada é gravado.
 */

/** Origem e destino em texto de tela; `origin` é `null` quando a viagem tem uma parada só. */
export type ExpenseTripRoute = {
  readonly destination: string
  readonly origin: string | null
}

const STATE_PATTERN = /^[A-Za-z]{2}$/u

/** `RUA X, 12, SAO CARLOS, SP` → `SAO CARLOS`; rótulo sem cidade e UF reconhecíveis volta inteiro. */
export function readStopLabelPlace(label: string): string | null {
  const parts = label
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (parts.length === 0) return null
  const last = parts[parts.length - 1] ?? ''
  const city = parts[parts.length - 2]
  if (parts.length >= 3 && STATE_PATTERN.test(last) && city !== undefined) return city
  return parts.join(', ')
}

/**
 * Primeira e última parada, em ordem de `sequence` (o chamador já ordena). Mesma cidade nas duas pontas vira só o
 * destino: "Campinas → Campinas" não diz nada a quem lê.
 */
export function deriveExpenseTripRoute(stopLabels: readonly string[]): ExpenseTripRoute | null {
  const places = stopLabels
    .map((label) => readStopLabelPlace(label))
    .filter((place): place is string => place !== null)
  const destination = places[places.length - 1]
  if (destination === undefined) return null
  const origin = places[0]
  return {
    destination,
    origin: origin === undefined || origin === destination ? null : origin,
  }
}
