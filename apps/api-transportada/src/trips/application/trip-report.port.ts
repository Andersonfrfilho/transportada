/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'
import type {
  ListTripReportFacetsParams,
  TripReportFacetEmitter,
  TripReportFacetPlaceKind,
  TripReportFacetSide,
  TripReportFilters,
  TripReportQuery,
} from '../domain/trip-report.types.js'

/** Uma linha por nota de viagem; `tripCreatedAt` é o texto com microssegundos que vira cursor. */
export type TripReportRecord = {
  readonly accessKey: string
  readonly amount: string
  readonly contractorName: string | null
  readonly deliveredAt: Date | null
  readonly documentNumber: string
  readonly documentSeries: string
  readonly documentStatus: TripDocumentSeparationStatus
  readonly recipientCity: string | null
  readonly recipientName: string
  readonly recipientState: string | null
  readonly returnReason: string | null
  readonly returnedAt: Date | null
  readonly tripCreatedAt: string
  readonly tripDocumentId: string
  readonly tripId: string
  readonly tripStatus: TripStatus
}

export type TripReportScopeParams = {
  readonly companyId: string
  readonly filters: TripReportFilters
}

export type TripReportPort = {
  countDocumentsWithoutTrip(params: {
    readonly companyId: string
    readonly documentIds: readonly string[]
  }): Promise<number>
  countRows(params: TripReportScopeParams): Promise<number>
  listDocumentStatusesByTrip(params: {
    readonly companyId: string
    readonly tripIds: readonly string[]
  }): Promise<ReadonlyMap<string, readonly TripDocumentSeparationStatus[]>>
  listFacetEmitters(params: ListTripReportFacetsParams): Promise<readonly TripReportFacetEmitter[]>
  listFacetPlaces(
    params: ListTripReportFacetsParams & {
      readonly kind: TripReportFacetPlaceKind
      readonly side: TripReportFacetSide
    },
  ): Promise<readonly string[]>
  listRows(params: {
    readonly companyId: string
    readonly query: TripReportQuery
  }): Promise<readonly TripReportRecord[]>
}
