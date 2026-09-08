/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que a montagem imprime por opção de rota (spec 096 T3) — puro, para o contrato provar o
 * cálculo sem montar o componente inteiro.
 *
 * ⚠️ **Rota única não é escolha** (spec 096 D2). O chamador só monta esta lista quando
 * `hasChoice` é `true` — aqui apenas o formato de cada linha é resolvido.
 */
import type { RouteGeometryOption } from './routeGeometry.service'

export type RouteOptionSummary = Readonly<{
  /**
   * ⚠️ `null` quando o pedágio da opção **não pôde ser calculado** — a anotação de nós não veio.
   * Zero aqui diria "esta rota não passa por praça nenhuma", que é uma afirmação, e ela apareceria
   * na única linha que o operador lê para escolher a rota. As duas coisas são diferentes desde a
   * spec 090 D1, e é aqui que a distinção chega à tela.
   */
  boothCount: null | number
  distanceKilometres: number
  /** `true` quando esta é, ao mesmo tempo, a mais rápida e a mais barata (spec 096 D1). */
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
 * critérios: é informação, não defeito (spec 096, caso medido de Campinas).
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
      boothCount: option.toll === null ? null : option.toll.booths.length,
      distanceKilometres: option.distanceMeters / METRES_PER_KILOMETRE,
      isBestOfBoth: isFastest && isCheapest,
      isCheapest,
      isFastest,
      minutes: Math.round(option.durationSeconds / SECONDS_PER_MINUTE),
      totalCost: option.totalCost,
    }
  })
}
