/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripCostKind } from './trip-valuation.policy.js'

/** Como cada parcela de custo chega à nota. Spec 226 D1 — tabela exaustiva, sem `default`. */
export const APPORTIONMENT_BASES = {
  /** Reparte pela distância do trecho, entre as notas a bordo dele. */
  distance: 'distance',
  /** Imposto: acompanha o frete da própria nota, proporcionalmente. */
  revenue: 'revenue',
  /** Reparte pelo tempo — duração do trecho e espera na parada (D9). */
  time: 'time',
  /** Não pertence a nota nenhuma: vai ao bolo da viagem e desce rateado (D3). */
  tripShare: 'tripShare',
} as const

export type ApportionmentBasis = (typeof APPORTIONMENT_BASES)[keyof typeof APPORTIONMENT_BASES]

/** De onde saiu a espera da parada. `unknown` não é zero medido — é zero por falta de dado. */
export const DWELL_BASES = {
  /** `departed − arrived`. */
  measured: 'measured',
  /** Sem `departed`: o último `delivered` da parada serviu de saída. */
  proxy: 'proxy',
  /** Sem `arrived`: não há espera a medir. */
  unknown: 'unknown',
} as const

export type DwellBasis = (typeof DWELL_BASES)[keyof typeof DWELL_BASES]

export const COST_BASES = { leg: 'leg', unavailable: 'unavailable' } as const
export type CostBasis = (typeof COST_BASES)[keyof typeof COST_BASES]

export const TIME_BASES = {
  complete: 'complete',
  incomplete: 'incomplete',
  partial: 'partial',
} as const
export type TimeBasis = (typeof TIME_BASES)[keyof typeof TIME_BASES]

export type ApportionmentLeg = {
  readonly distanceMetres: number
  readonly durationSeconds: number
}

export type ApportionmentStop = {
  /** Espera na parada, em segundos. `0` com `dwellBasis: 'unknown'` quando não houve como medir. */
  readonly dwellBasis: DwellBasis
  readonly dwellSeconds: number
  readonly id: string
}

export type ApportionmentDocument = {
  readonly freightAmount: string
  /** `null` quando a nota não está amarrada a parada nenhuma — ela só entra no rateio de viagem. */
  readonly stopId: null | string
  readonly tripDocumentId: string
}

export type ApportionmentCostParcel = {
  readonly amount: null | string
  readonly kind: TripCostKind
}

export type ApportionDocumentCostsParams = {
  readonly costParcels: readonly ApportionmentCostParcel[]
  readonly documents: readonly ApportionmentDocument[]
  /** `legs[i]` é o trecho que **chega** a `stops[i]`. Contagem diferente da de paradas = ausência. */
  readonly legs: readonly ApportionmentLeg[]
  readonly returnDistanceMetres: null | number
  /** Na ordem da rota. */
  readonly stops: readonly ApportionmentStop[]
}

export type DocumentCostFigures = {
  readonly costAmount: null | string
  readonly costBasis: CostBasis
  readonly freightAmount: string
  readonly legCostAmount: null | string
  readonly marginAmount: null | string
  readonly marginPercentage: null | string
  readonly taxAmount: null | string
  readonly timeBasis: TimeBasis
  readonly tripDocumentId: string
  readonly tripShareCostAmount: null | string
}

export type ApportionDocumentCostsResult = {
  readonly documents: readonly DocumentCostFigures[]
}

export type CostKindApportionment = Readonly<Record<TripCostKind, ApportionmentBasis>>
