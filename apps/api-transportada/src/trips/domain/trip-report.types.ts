/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeDocumentStatus } from '../../database/nfe.schema.js'
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'
import type { TripReportCteIssued, TripReportValueOperator } from './trip-report.constant.js'
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
  readonly cteIssued?: TripReportCteIssued | undefined
  readonly documentIdIn?: readonly string[] | undefined
  readonly documentStatusIn?: readonly TripDocumentSeparationStatus[] | undefined
  readonly driverIdIn?: readonly string[] | undefined
  readonly emitterAddress?: string | undefined
  readonly emitterCityIn?: readonly string[] | undefined
  readonly emitterNameIn?: readonly string[] | undefined
  readonly emitterStateIn?: readonly string[] | undefined
  readonly emitterTaxIdIn?: readonly string[] | undefined
  readonly fiscalStatusIn?: readonly NfeDocumentStatus[] | undefined
  readonly issuedFrom?: string | undefined
  readonly issuedUntil?: string | undefined
  readonly numberFrom?: string | undefined
  readonly numberTo?: string | undefined
  readonly proofPendingEq?: boolean | undefined
  readonly recipientAddress?: string | undefined
  readonly recipientCityIn?: readonly string[] | undefined
  readonly recipientName?: string | undefined
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

/** Spec 258 RF3: só os filtros de viagem — as opções nunca encolhem pelo filtro de nota. */
export type TripReportFacetFilters = Pick<
  TripReportFilters,
  | 'contractorIdIn'
  | 'createdFrom'
  | 'createdUntil'
  | 'documentStatusIn'
  | 'driverIdIn'
  | 'proofPendingEq'
  | 'statusIn'
  | 'tripIdIn'
  | 'vehicleIdIn'
>

export type ListTripReportFacetsParams = {
  readonly companyId: string
  readonly filters: TripReportFacetFilters
}

export type TripReportFacetEmitter = {
  readonly name: string
  readonly taxId: string
}

export type TripReportFacetSides = {
  readonly emitter: readonly string[]
  readonly recipient: readonly string[]
}

export type TripReportFacets = {
  readonly cities: TripReportFacetSides
  readonly emitters: readonly TripReportFacetEmitter[]
  readonly states: TripReportFacetSides
}

export type ListTripReportFacetsResult = { readonly data: TripReportFacets }

export type TripReportFacetPlaceKind = 'city' | 'state'

export type TripReportFacetSide = 'emitter' | 'recipient'
