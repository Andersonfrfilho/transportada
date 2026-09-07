/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que a montagem imprime por opção de rota (spec 093 T3) — puro, para o contrato provar o
 * cálculo sem montar o componente inteiro.
 *
 * ⚠️ **Rota única não é escolha** (spec 093 D2). O chamador só monta esta lista quando
 * `hasChoice` é `true` — aqui apenas o formato de cada linha é resolvido.
 */
import type { RouteGeometryOption } from './routeGeometry.service'

export type RouteOptionSummary = Readonly<{
  boothCount: number
  distanceKilometres: number
  /** `true` quando esta é, ao mesmo tempo, a mais rápida e a mais barata (spec 093 D1). */
  isBestOfBoth: boolean
  isCheapest: boolean
  isFastest: boolean
  minutes: number
  totalCost: null | string
}>

const SECONDS_PER_MINUTE = 60
const METRES_PER_KILOMETRE = 1000

/**
 * Uma linha por opção, na mesma ordem que a rota chegou — a principal primeiro. `isBestOfBoth`
 * existe para a tela **não** imprimir duas marcas redundantes quando a mesma rota vence os dois
 * critérios: é informação, não defeito (spec 093, caso medido de Campinas).
 */
export function resolveRouteOptionSummaries(input: {
  readonly cheapestIndex: null | number
  readonly fastestIndex: null | number
  readonly options: readonly RouteGeometryOption[]
}): readonly RouteOptionSummary[] {
  return input.options.map((option, index) => {
    const isFastest = input.fastestIndex === index
    const isCheapest = input.cheapestIndex === index

    return {
      boothCount: option.toll?.booths.length ?? 0,
      distanceKilometres: option.distanceMeters / METRES_PER_KILOMETRE,
      isBestOfBoth: isFastest && isCheapest,
      isCheapest,
      isFastest,
      minutes: Math.round(option.durationSeconds / SECONDS_PER_MINUTE),
      totalCost: option.totalCost,
    }
  })
}
