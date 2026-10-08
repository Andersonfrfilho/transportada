/* Copyright (c) 2026 Ada Technology. MIT License. */

export const TRIP_REPORT_TONES = {
  FINISHED: 'finished',
  ON_ROUTE: 'on_route',
  TOTAL_RETURN: 'total_return',
  WAREHOUSE: 'warehouse',
} as const
export type TripReportTone = (typeof TRIP_REPORT_TONES)[keyof typeof TRIP_REPORT_TONES]

export type TripReportValueOperator = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'neq'

export type TripReportRow = Readonly<{
  accessKey: string
  amount?: string
  contractorName: null | string
  deliveredAt?: string
  documentNumber: string
  documentSeries: string
  documentStatus: 'delivered' | 'loaded' | 'pending' | 'returned' | 'separated'
  recipientCity: null | string
  recipientName: string
  recipientState: null | string
  returnReason?: string
  returnedAt?: string
  tone: TripReportTone
  tripId: string
}>

/** Mesmos nomes dos parâmetros de `GET /trip-document-report`; listas viajam separadas por vírgula. */
export type TripReportFilters = Readonly<{
  contractorIdIn?: readonly string[]
  createdFrom?: string
  createdUntil?: string
  cteIssued?: string
  documentIdIn?: readonly string[]
  documentStatusIn?: readonly string[]
  driverIdIn?: readonly string[]
  emitterAddress?: string
  emitterCityIn?: readonly string[]
  emitterNameIn?: readonly string[]
  emitterStateIn?: readonly string[]
  emitterTaxIdIn?: readonly string[]
  fiscalStatusIn?: readonly string[]
  issuedFrom?: string
  issuedUntil?: string
  numberFrom?: string
  numberTo?: string
  proofPendingEq?: boolean
  recipientAddress?: string
  recipientCityIn?: readonly string[]
  recipientName?: string
  recipientStateIn?: readonly string[]
  search?: string
  statusIn?: readonly string[]
  tripIdIn?: readonly string[]
  valueAmount?: string
  valueOperator?: TripReportValueOperator
  vehicleIdIn?: readonly string[]
}>

export type TripReportFacetEmitter = Readonly<{ name: string; taxId: string }>

export type TripReportFacets = Readonly<{
  cities: Readonly<{ emitter: readonly string[]; recipient: readonly string[] }>
  emitters: readonly TripReportFacetEmitter[]
  states: Readonly<{ emitter: readonly string[]; recipient: readonly string[] }>
}>

export type TripReportFetchFacets = (
  input?: Readonly<{ signal?: AbortSignal }>,
) => Promise<TripReportFacets>

export type TripReportPageInput = Readonly<{
  cursor: null | string
  filters: TripReportFilters
  limit: number
  signal?: AbortSignal
}>

export type TripReportPage = Readonly<{
  excludedWithoutTrip?: number
  nextCursor: null | string
  rows: readonly TripReportRow[]
  total?: number
}>

export type TripReportFetchPage = (input: TripReportPageInput) => Promise<TripReportPage>

export type TripReportResult = Readonly<{
  excludedWithoutTrip: number
  rows: readonly TripReportRow[]
}>
