/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'
import type { TripReportValueOperator } from './trip-report.constant.js'
import type { TripReportTone } from './resolve-trip-report-tone.policy.js'

/** `createdAt` é o `created_at` da viagem com microssegundos (`to_char`), não um `Date`. */
export type TripReportCursor = {
  readonly createdAt: string
  readonly tripDocumentId: string
  readonly tripId: string
}

export type TripReportContractorFilter = {
  readonly contractorIds: readonly string[]
  readonly includesNone: boolean
}

export type TripReportFilters = {
  readonly contractorIdIn?: TripReportContractorFilter | undefined
  readonly createdFrom?: string | undefined
  readonly createdUntil?: string | undefined
  readonly documentIdIn?: readonly string[] | undefined
  readonly documentStatusIn?: readonly TripDocumentSeparationStatus[] | undefined
  readonly driverIdIn?: readonly string[] | undefined
  readonly proofPendingEq?: boolean | undefined
  readonly recipientCityIn?: readonly string[] | undefined
  readonly recipientStateIn?: readonly string[] | undefined
  readonly search?: string | undefined
  readonly statusIn?: readonly TripStatus[] | undefined
  readonly tripIdIn?: readonly string[] | undefined
  readonly valueAmount?: string | undefined
  readonly valueOperator?: TripReportValueOperator | undefined
  readonly vehicleIdIn?: readonly string[] | undefined
}

export type TripReportQuery = {
  readonly cursor: TripReportCursor | undefined
  readonly filters: TripReportFilters
  readonly limit: number
}

export type ListTripReportParams = {
  readonly canReadFinancials: boolean
  readonly companyId: string
  readonly query: TripReportQuery
}

export type TripReportRow = {
  readonly accessKey: string
  readonly amount?: string
  readonly contractorName: string | null
  readonly deliveredAt?: string
  readonly documentNumber: string
  readonly documentSeries: string
  readonly documentStatus: TripDocumentSeparationStatus
  readonly recipientCity: string | null
  readonly recipientName: string
  readonly recipientState: string | null
  readonly returnReason?: string
  readonly returnedAt?: string
  readonly tone: TripReportTone
  readonly tripId: string
}

/** `total` e `excludedWithoutTrip` só existem na primeira página (sem `cursor`). */
export type ListTripReportResult = {
  readonly data: readonly TripReportRow[]
  readonly excludedWithoutTrip?: number
  readonly page: { readonly nextCursor: string | null; readonly total?: number }
}
