/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que a montagem imprime por opção de rota (spec 096 T3) — puro, para o contrato provar o
 * cálculo sem montar o componente inteiro.
 *
 * ⚠️ **Rota única não é escolha** (spec 096 D2). O chamador só monta esta lista quando
 * `hasChoice` é `true` — aqui apenas o formato de cada linha é resolvido.
 */
import type { RouteChoice, RouteGeometryOption } from './routeGeometry.service'

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
  /**
   * Spec 165 RF1: esta opção veio da chamada `exclude=toll` (spec 153). ⚠️ É **diferente** de
   * `boothCount === 0` — a rota comum que não cruza praça nenhuma também conta zero, e sem esta
   * marca as duas linhas ficam idênticas na tela em que o operador escolhe a rota.
   */
  isNoToll: boolean
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
      isNoToll: option.isNoToll,
      minutes: Math.round(option.durationSeconds / SECONDS_PER_MINUTE),
      totalCost: option.totalCost,
    }
  })
}

/**
 * A rota escolhida na montagem, no formato que o planejamento aceita (spec 153 D2/D3). A
 * **assinatura** é o que reencontra a rota — o índice de agora é outra estrada quando a API pede as
 * rotas de novo —, e o critério só decide quando ela não é reencontrada.
 *
 * ⚠️ Rota única não é escolha (spec 096 D2): `undefined`, e o planejamento segue o critério padrão.
 */
export function resolveAssemblyRouteChoice(input: {
  readonly cheapestIndex: null | number
  readonly fastestIndex: null | number
  readonly hasChoice: boolean
  readonly options: readonly RouteGeometryOption[]
  readonly selectedIndex: number
}): RouteChoice | undefined {
  const option = input.options[input.selectedIndex]
  if (!input.hasChoice || option === undefined) return undefined

  return { criterion: resolveChoiceCriterion({ ...input, option }), signature: option.signature }
}

/** Nenhum rótulo é `alternative`: o operador trocou de rota sem regra declarada. */
function resolveChoiceCriterion(input: {
  readonly cheapestIndex: null | number
  readonly fastestIndex: null | number
  readonly option: RouteGeometryOption
  readonly selectedIndex: number
}): RouteChoice['criterion'] {
  if (input.selectedIndex === input.cheapestIndex) return 'cheapest'
  if (input.selectedIndex === input.fastestIndex) return 'fastest'
  if (input.option.isNoToll) return 'no_toll'
  return 'alternative'
}

/**
 * A rota que o operador tinha escolhido antes de sair da tela, reencontrada **pela assinatura**. Sem
 * assinatura igual a estrada é outra (a ordem ou o veículo mudou), e a escolha antiga não se aplica:
 * `undefined` deixa o mapa na principal, como em qualquer rota nova.
 */
export function resolvePreferredRouteOptionIndex(input: {
  readonly options: readonly Readonly<{ signature: null | string }>[]
  readonly preferred: RouteChoice | undefined
}): number | undefined {
  const signature = input.preferred?.signature ?? null
  if (signature === null) return undefined
  const index = input.options.findIndex((option) => option.signature === signature)
  return index === -1 ? undefined : index
}

/**
 * A escolha só é publicada com uma resposta da estrada na mão. Sem resposta — rascunho, consulta a
 * caminho ou ainda desligada enquanto o mapa monta —, publicar "sem escolha" apagaria a rota que o
 * operador tinha escolhido e que acabou de voltar do rascunho.
 */
export function isRouteChoiceSettled(input: {
  readonly hasResponse: boolean
  readonly isDraft: boolean
  readonly isFetching: boolean
}): boolean {
  return input.hasResponse && !input.isDraft && !input.isFetching
}
