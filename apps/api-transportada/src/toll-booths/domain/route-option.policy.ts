/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Qual das rotas é a mais rápida e qual é a mais barata (spec 096 D1).
 *
 * ⚠️ **"Mais barata" é o custo total — pedágio mais combustível —, nunca só o pedágio.** Medido em
 * 2026-09-07, Ribeirão Preto → Campinas: a alternativa tem uma praça a menos e economiza R$ 15,40,
 * rodando 18,1 km a mais. Num toco a 3,5 km/l com diesel a R$ 6,20 esses quilômetros custam ~R$ 32 —
 * a rota com **menos praça** sai ~R$ 16 **mais cara**, e chega 19 minutos depois.
 *
 * Chamá-la de "mais barata" seria mentira produzida por nós, num rótulo que o operador acredita e
 * usa para decidir se aceita a carga. É a ADR-0044 §1 na forma mais direta que existe.
 */
import {
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import { fuelCost } from '../../trips/domain/trip-valuation.policy.js'

const ERROR_CODE_PREFIX = 'ROUTE_OPTION'

/**
 * Por que não há eleição de mais barata. As duas razões são de **ausência de dado**, nunca de
 * empate: o rótulo simplesmente não é atribuído, e a tela diz qual das duas faltou.
 */
export const ROUTE_COST_GAPS = {
  /** O veículo não declara consumo, ou não há preço para o combustível dele. */
  noFuelBaseline: 'NO_FUEL_BASELINE',
  /** Alguma opção não sabe o próprio pedágio — e desconhecido não vira zero. */
  tollUnknown: 'TOLL_UNKNOWN',
} as const
export type RouteCostGap = (typeof ROUTE_COST_GAPS)[keyof typeof ROUTE_COST_GAPS]

export type RouteOptionInput = Readonly<{
  distanceMeters: number
  durationSeconds: number
  /** `null` quando a rota não soube dizer — a anotação de nós não veio (090 D1). */
  tollTotal: null | string
}>

export type RouteOptionVehicle = Readonly<{
  kilometersPerLiter: null | string
  pricePerLiter: null | string
}>

export type RankedRouteOption = RouteOptionInput &
  Readonly<{
    /** `null` quando não há como calcular — nunca zero, que diria "não gasta combustível". */
    fuelTotal: null | string
    totalCost: null | string
  }>

export type RankedRouteOptions = Readonly<{
  /** `null` quando o custo não pôde ser comparado; `costGap` diz por quê. */
  cheapestIndex: null | number
  costGap: null | RouteCostGap
  fastestIndex: null | number
  /** Uma opção só não é escolha, e a tela usa isto para não desenhar seletor nenhum (D2). */
  hasChoice: boolean
  options: readonly RankedRouteOption[]
}>

export type RankRouteOptionsParams = {
  readonly options: readonly RouteOptionInput[]
  readonly vehicle: RouteOptionVehicle
}

export function rankRouteOptions(input: RankRouteOptionsParams): RankedRouteOptions {
  const baseline = resolveFuelBaseline(input.vehicle)
  const missingToll = input.options.some((option) => option.tollTotal === null)

  const options = input.options.map((option) => {
    const fuelTotal =
      baseline === null
        ? null
        : fuelCost({
            distanceMeters: option.distanceMeters,
            kilometersPerLiter: baseline.kilometersPerLiter,
            pricePerLiter: baseline.pricePerLiter,
          })

    return { ...option, fuelTotal, totalCost: totalOf({ fuelTotal, tollTotal: option.tollTotal }) }
  })

  return {
    cheapestIndex: cheapestOf(options),
    costGap: resolveCostGap({ baseline, missingToll }),
    fastestIndex: fastestOf(options),
    hasChoice: options.length > 1,
    options,
  }
}

function resolveFuelBaseline(
  vehicle: RouteOptionVehicle,
): null | Readonly<{ kilometersPerLiter: string; pricePerLiter: string }> {
  const { kilometersPerLiter, pricePerLiter } = vehicle
  if (kilometersPerLiter === null || pricePerLiter === null) return null

  return { kilometersPerLiter, pricePerLiter }
}

/**
 * ⚠️ Uma parcela ausente torna o total ausente. Somar só o pedágio e chamar de total produziria
 * exatamente o rótulo que esta política existe para impedir.
 */
function totalOf(input: {
  readonly fuelTotal: null | string
  readonly tollTotal: null | string
}): null | string {
  if (input.fuelTotal === null || input.tollTotal === null) return null

  return formatScaledDecimal(money(input.fuelTotal) + money(input.tollTotal), MONEY_SCALE)
}

function money(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: MONEY_SCALE, value })
}

/** Empate fica com a primeira: é a que o roteirizador considerou principal. */
function fastestOf(options: readonly RankedRouteOption[]): null | number {
  return indexOfBest(options, (option) => BigInt(Math.round(option.durationSeconds)))
}

function cheapestOf(options: readonly RankedRouteOption[]): null | number {
  if (options.some((option) => option.totalCost === null)) return null

  return indexOfBest(options, (option) => money(option.totalCost ?? '0'))
}

function indexOfBest(
  options: readonly RankedRouteOption[],
  weightOf: (option: RankedRouteOption) => bigint,
): null | number {
  let best: null | number = null
  let bestWeight = 0n
  options.forEach((option, index) => {
    const weight = weightOf(option)
    if (best === null || weight < bestWeight) {
      best = index
      bestWeight = weight
    }
  })

  return best
}

function resolveCostGap(input: {
  readonly baseline: null | object
  readonly missingToll: boolean
}): null | RouteCostGap {
  if (input.baseline === null) return ROUTE_COST_GAPS.noFuelBaseline
  if (input.missingToll) return ROUTE_COST_GAPS.tollUnknown

  return null
}
