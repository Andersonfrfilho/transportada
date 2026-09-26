/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 206 D3 (ADR-0088 §4): o toque de saída entra na fila offline, e a drenagem real não garante
 * ordem — um item recusado pode ser reenviado horas depois, fora de ordem. O servidor compara o
 * `tappedAt` do aparelho com o que já aconteceu na viagem, para não marcar a parada errada agora
 * por causa de um toque que descreve intenção passada.
 */
import { DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS } from './field-delivery-timing.policy.js'

/** Tolerância de relógio entre o aparelho e o servidor — a mesma da hora informada (D3). */
export const DEPARTURE_TAPPED_AT_TOLERANCE_MILLISECONDS = DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS

export type ResolveDepartureTappedAtParams = {
  /** O despacho congelado da viagem — `findInformedTimeWindowStart` (ADR-0067 §3). `null` sem ele. */
  readonly dispatchedAt: Date | null
  readonly now: Date
  readonly tappedAt: Date
}

/**
 * D3: `tappedAt` fora da janela do relógio do aparelho (mais de 2 min no futuro, ou antes do
 * despacho congelado) dispensa a comparação — devolve `null`, que a linha do evento grava como
 * `tapped_at` nulo. Relógio errado do aparelho não recusa nem trava a fila.
 */
export function resolveDepartureTappedAt(params: ResolveDepartureTappedAtParams): Date | null {
  const latestAllowed = params.now.getTime() + DEPARTURE_TAPPED_AT_TOLERANCE_MILLISECONDS
  if (params.tappedAt.getTime() > latestAllowed) return null
  if (params.dispatchedAt !== null && params.tappedAt.getTime() < params.dispatchedAt.getTime()) {
    return null
  }

  return params.tappedAt
}

export type IsDepartureTapStaleParams = {
  readonly lastArrivedAt: Date | null
  readonly lastDepartedTappedAt: Date | null
  readonly resolvedTappedAt: Date | null
}

/**
 * D2/D3: um toque anterior ao último `departed` ou ao último `arrived` da viagem, com a tolerância
 * do relógio, descreve intenção passada — não marca a parada errada. Um `resolvedTappedAt` nulo
 * (fora da janela) nunca é velho: sem referência de tempo, não há o que comparar.
 */
export function isDepartureTapStale(params: IsDepartureTapStaleParams): boolean {
  if (params.resolvedTappedAt === null) return false

  const reference = laterDate(params.lastDepartedTappedAt, params.lastArrivedAt)
  if (reference === null) return false

  return (
    params.resolvedTappedAt.getTime() <
    reference.getTime() - DEPARTURE_TAPPED_AT_TOLERANCE_MILLISECONDS
  )
}

function laterDate(first: Date | null, second: Date | null): Date | null {
  if (first === null) return second
  if (second === null) return first

  return first.getTime() >= second.getTime() ? first : second
}
