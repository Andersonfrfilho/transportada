/* Copyright (c) 2026 Ada Technology. MIT License. */

import type { DriverTrip } from './driverTrip.types'
import { isStopResolved } from './driverTripProgress.service'

/** Quanto tempo o card que acabou de virar o atual fica destacado. */
export const ARRIVED_HIGHLIGHT_MS = 1800

export type StopPlace = 'first' | 'last' | 'next'

/**
 * Pedido do usuário (14/10): ao concluir uma parada o foco vai à seguinte, mas não ficava claro que
 * ela é a **próxima** nem que a última fecha a viagem. A parada atual é:
 * - `first`: a primeira da viagem (ou sem posição conhecida) — "Em andamento", como sempre foi;
 * - `next`: uma do meio, depois de ao menos uma resolvida — "Próxima parada · 2 de 5";
 * - `last`: a última de uma viagem de mais de uma parada — "Última parada · 5 de 5" e o aviso de que
 *   a viagem se encerra sozinha quando as notas dela forem entregues ou devolvidas.
 * Só a parada atual recebe lugar; as outras nunca (`undefined`).
 */
export function resolveStopPlace(input: {
  readonly isCurrent: boolean
  readonly position: Readonly<{ index: number; total: number }> | undefined
}): StopPlace | undefined {
  const { isCurrent, position } = input
  if (!isCurrent || position === undefined || position.total < 2) return undefined
  if (position.index >= position.total) return 'last'
  if (position.index > 1) return 'next'
  return 'first'
}

/** Toda parada resolvida (entregue ou devolvida): a viagem se encerra sozinha, e a tela diz isso. */
export function isTripFullySettled(trip: DriverTrip): boolean {
  return trip.stops.length > 0 && trip.stops.every(isStopResolved)
}

/**
 * Duração da viagem para a faixa final: da primeira chegada à última conclusão, em minutos.
 * `undefined` quando falta algum dos dois instantes ou o intervalo é inválido (nunca inventa tempo).
 */
export function tripElapsedMinutes(trip: DriverTrip): number | undefined {
  const arrivals = trip.stops.flatMap((stop) =>
    stop.arrivedAt === null ? [] : [Date.parse(stop.arrivedAt)],
  )
  const completions = trip.stops.flatMap((stop) =>
    stop.completedAt === null ? [] : [Date.parse(stop.completedAt)],
  )
  if (arrivals.length === 0 || completions.length === 0) return undefined
  const minutes = Math.round((Math.max(...completions) - Math.min(...arrivals)) / 60_000)
  return Number.isFinite(minutes) && minutes > 0 ? minutes : undefined
}

/** `252` → "4 h 12 min"; menos de uma hora → "35 min". */
export function formatElapsedMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return `${hours} h ${String(rest).padStart(2, '0')} min`
}
