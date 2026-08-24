/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Contrato da série semanal que o ciclo consome. O cliente da ANP é a implementação de hoje; o
 * caso de uso não conhece planilha, HTTP nem rótulo de produto da fonte.
 */
import type { FuelProduct, FuelUnit } from '../domain/fuel.constant.js'
import type { ReferenceWeek } from '../domain/reference-week.policy.js'

export type FuelSeriesReference = {
  readonly averagePricePerUnit: string
  readonly product: FuelProduct
  readonly state: string
  readonly stationCount: number
  readonly unit: FuelUnit
}

export type FuelWeeklySeries = {
  readonly discardedRows: number
  readonly references: readonly FuelSeriesReference[]
  readonly weekEndingOn: string
  readonly weekStartingOn: string
}

export type FuelSeriesPort = {
  readonly fetchWeeklySeries: (week: ReferenceWeek) => Promise<FuelWeeklySeries>
}
