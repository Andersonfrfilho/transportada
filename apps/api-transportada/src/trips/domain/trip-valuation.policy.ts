/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'TRIP_VALUATION'
const PERCENT_FACTOR = 100n

/**
 * Spec 065 D7 e 061 D2: **nenhuma parcela ausente vira zero silencioso.** Uma margem de 18% que na
 * verdade é "18% se o combustível estiver certo, e ele foi estimado" leva a decisão errada com mais
 * confiança do que número nenhum levaria.
 */
export const VALUATION_SOURCES = ['measured', 'estimated', 'missing'] as const
export type ValuationSource = (typeof VALUATION_SOURCES)[number]

/**
 * Por que a parcela não pôde ser calculada. Existe para a tela dizer o que fazer — "cadastre o preço
 * do diesel" é acionável; "combustível: 0" manda o operador adivinhar.
 */
export const VALUATION_GAPS = {
  /** As taxas de entrega são da spec 060, que ainda não foi construída. */
  featureAbsent: 'FEATURE_ABSENT',
  /**
   * O valor do motorista sai de `freight_region_driver_rates`, que é por **classe de frete** — e o
   * veículo ainda não declara classe nenhuma. Não é zero: é desconhecido.
   */
  noDriverRate: 'NO_DRIVER_RATE',
  /** Nenhuma regra de frete casa com a nota: sem parâmetro não há receita prevista. */
  noFreightRule: 'NO_FREIGHT_RULE',
  /** O veículo não declara consumo médio, ou a empresa não tem preço para o combustível dele. */
  noFuelBaseline: 'NO_FUEL_BASELINE',
  /** O roteiro ainda não foi calculado, então não há quilometragem para multiplicar. */
  noPlannedDistance: 'NO_PLANNED_DISTANCE',
  /** Pedágio é lançamento manual e ainda não existe (061 D2). */
  notRecorded: 'NOT_RECORDED',
} as const

export type ValuationGap = (typeof VALUATION_GAPS)[keyof typeof VALUATION_GAPS]

export const TRIP_COST_KINDS = [
  'driver',
  'fuel',
  'other_per_kilometer',
  'toll',
  'delivery_charges',
] as const
export type TripCostKind = (typeof TRIP_COST_KINDS)[number]

export type TripRevenueLine = {
  readonly amount: string
  readonly gap: null | ValuationGap
  readonly nfeDocumentId: null | string
  readonly source: ValuationSource
  readonly tripDocumentId: string
}

export type TripCostParcel = {
  readonly amount: string
  readonly gap: null | ValuationGap
  readonly kind: TripCostKind
  readonly source: ValuationSource
}

export type TripValuation = {
  readonly costParcels: readonly TripCostParcel[]
  /**
   * O total sozinho mente quando falta parcela. Este campo é o que a tela usa para dizer isso ao
   * lado do número, em vez de esconder o número — que seria pior.
   */
  readonly hasGaps: boolean
  /** `null` quando a receita é zero — dividir por zero produziria margem infinita, não informação. */
  readonly marginPercentage: null | string
  readonly revenueLines: readonly TripRevenueLine[]
  /** `measured` só quando **toda** linha é medida: uma prevista no meio já torna o total previsão. */
  readonly revenueSource: ValuationSource
  readonly totalCost: string
  readonly totalMargin: string
  readonly totalRevenue: string
}

export type BuildTripValuationParams = {
  readonly costParcels: readonly TripCostParcel[]
  readonly revenueLines: readonly TripRevenueLine[]
}

export function buildTripValuation(input: BuildTripValuationParams): TripValuation {
  const totalRevenue = sum(input.revenueLines.map((line) => line.amount))
  const totalCost = sum(input.costParcels.map((parcel) => parcel.amount))
  const totalMargin = totalRevenue - totalCost

  return {
    costParcels: input.costParcels,
    hasGaps:
      input.revenueLines.some((line) => line.gap !== null) ||
      input.costParcels.some((parcel) => parcel.gap !== null),
    marginPercentage:
      totalRevenue === 0n
        ? null
        : formatScaledDecimal(
            divideHalfUp(totalMargin * PERCENT_FACTOR * scaleFactor(), totalRevenue),
            MONEY_SCALE,
          ),
    revenueLines: input.revenueLines,
    revenueSource: collapseSource(input.revenueLines.map((line) => line.source)),
    totalCost: formatScaledDecimal(totalCost, MONEY_SCALE),
    totalMargin: formatScaledDecimal(totalMargin, MONEY_SCALE),
    totalRevenue: formatScaledDecimal(totalRevenue, MONEY_SCALE),
  }
}

/**
 * Custo por quilômetro contra a distância planejada. A distância chega em **metros inteiros** do
 * roteiro, e a conversão para quilômetro acontece aqui, uma vez — espalhá-la pelas parcelas é como
 * uma delas acaba dividindo por mil na hora errada.
 */
export function costOverDistance(input: {
  readonly amountPerKilometer: string
  readonly distanceMeters: number
}): string {
  const perKilometer = parseMoney(input.amountPerKilometer)
  return formatScaledDecimal(
    divideHalfUp(perKilometer * BigInt(Math.round(input.distanceMeters)), 1000n),
    MONEY_SCALE,
  )
}

/**
 * Combustível: quilômetros ÷ consumo × preço do litro. O consumo é km/l, então ele **divide** — a
 * inversão silenciosa é o erro clássico aqui, e é por isso que a ordem está escrita numa função só.
 */
export function fuelCost(input: {
  readonly distanceMeters: number
  readonly kilometersPerLiter: string
  readonly pricePerLiter: string
}): null | string {
  const consumption = parseMoney(input.kilometersPerLiter)
  if (consumption <= 0n) return null

  const meters = BigInt(Math.round(input.distanceMeters))
  const litersScaled = divideHalfUp(meters * scaleFactor() * scaleFactor(), consumption * 1000n)

  return formatScaledDecimal(
    divideHalfUp(litersScaled * parseMoney(input.pricePerLiter), scaleFactor()),
    MONEY_SCALE,
  )
}

/**
 * O pior caso vence, e a ordem é essa: uma linha ausente torna o conjunto ausente, e uma prevista
 * torna o conjunto previsão. Chamar de "medido" um total com uma previsão dentro é a mentira que a
 * D1 da 061 existe para impedir.
 */
function collapseSource(sources: readonly ValuationSource[]): ValuationSource {
  if (sources.length === 0) return 'missing'
  if (sources.includes('missing')) return 'missing'
  if (sources.includes('estimated')) return 'estimated'

  return 'measured'
}

function sum(values: readonly string[]): bigint {
  return values.reduce((total, value) => total + parseMoney(value), 0n)
}

function parseMoney(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: MONEY_SCALE, value })
}

function scaleFactor(): bigint {
  return 10n ** MONEY_SCALE
}
