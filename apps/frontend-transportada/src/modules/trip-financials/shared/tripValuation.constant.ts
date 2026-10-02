/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do vocabulário da API (spec 225) — o bundle não carrega código de lá. */
export const COST_BASIS = { LEG: 'leg', UNAVAILABLE: 'unavailable' } as const
export type CostBasis = (typeof COST_BASIS)[keyof typeof COST_BASIS]
export const COST_BASES: readonly CostBasis[] = Object.values(COST_BASIS)

export const TIME_BASIS = {
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
  PARTIAL: 'partial',
} as const
export type TimeBasis = (typeof TIME_BASIS)[keyof typeof TIME_BASIS]
export const TIME_BASES: readonly TimeBasis[] = Object.values(TIME_BASIS)

/**
 * A ausência do gasto por nota é a mesma ausência que a conta da viagem já nomeia: roteiro ainda
 * não calculado. Mesmo código de lacuna, mesma chave de locale (`gap.NO_PLANNED_DISTANCE`) — texto
 * novo para a mesma falta faria as duas telas discordarem.
 */
export const UNAVAILABLE_COST_GAP = 'NO_PLANNED_DISTANCE'
