/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  TripFinancialNature,
  TripFinancialParcelKind,
  TripFinancialSource,
} from '../../database/trip-financial.schema.js'

export type TripFinancialParcel = {
  readonly amount: string
  readonly kind: TripFinancialParcelKind
  readonly nature: TripFinancialNature
  readonly note: string
  readonly source: TripFinancialSource
}

export type TripFinancialResult = {
  readonly assumptions: Readonly<Record<string, unknown>>
  readonly costTotal: string
  readonly frozenAt: string
  readonly isComplete: boolean
  readonly marginRate: null | string
  readonly netAmount: string
  readonly parcels: readonly TripFinancialParcel[]
  readonly recalculationReason: string
  readonly revenueAmount: string
  readonly revenueDocumentCount: number
  readonly revenueExpectedCount: number
  readonly taxTotal: string
  readonly tripId: string
  readonly version: number
}

export type TripFinancialResultPort = {
  /** A versão viva, se já houve congelamento. `null` enquanto a viagem não fechou. */
  findCurrent(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripFinancialResult | null>
  /**
   * Grava a versão nova e aposenta a anterior **na mesma transação**: duas versões vivas seriam duas
   * respostas para "quanto essa viagem deu".
   */
  insertVersion(input: {
    readonly actorUserId: null | string
    readonly companyId: string
    readonly result: Omit<TripFinancialResult, 'frozenAt' | 'version'>
  }): Promise<TripFinancialResult>
}
