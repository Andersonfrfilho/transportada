/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripReportFilters, TripReportRow } from './trip-report.types.js'

export type TripProofImage = {
  readonly mimeType: string
  readonly read: () => Promise<Uint8Array>
}

/** Um bloco por canhoto; nota sem canhoto também é um bloco, com `image` indefinida. */
export type TripProofBlock = {
  readonly image: TripProofImage | undefined
  readonly proofIndex: number
  readonly proofTotal: number
  readonly row: TripReportRow
}

export type TripProofLetterhead = {
  readonly legalName: string
  readonly logoBytes: Uint8Array | undefined
  readonly taxLine: string
}

export type ExportTripProofPdfParams = {
  readonly canReadFinancials: boolean
  readonly companyId: string
  readonly exportedByUserId: string
  readonly filters: TripReportFilters
}

export type ExportTripProofPdfResult = {
  readonly filename: string
  readonly stream: ReadableStream<Uint8Array>
}
