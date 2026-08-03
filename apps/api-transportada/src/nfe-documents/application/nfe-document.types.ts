/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'

export type NfeDocumentSummary = {
  readonly accessKey: string
  readonly cteBlockReason: string | null
  readonly emitterAddress: string | null
  readonly emitterCity: string | null
  readonly emitterCityCode: string | null
  readonly emitterName: string
  readonly emitterState: string | null
  readonly emitterTaxId: string | null
  readonly id: string
  readonly issuedAt: string
  readonly number: string
  readonly recipientAddress: string | null
  readonly recipientCity: string | null
  readonly recipientCityCode: string | null
  readonly recipientName: string
  readonly recipientState: string | null
  readonly recipientTaxId: string | null
  readonly series: string
  readonly status: 'authorized' | 'cancelled' | 'denied' | 'unsigned'
  readonly totalAmount: string
  readonly variant: 'complete' | 'summary' | 'event'
}

export type NfeDocumentDetail = NfeDocumentSummary

export type NfeDocumentPage = {
  readonly items: readonly NfeDocumentSummary[]
  readonly nextCursor: string | null
}

export type DownloadNfeDocumentXmlResult = {
  readonly accessKey: string
  readonly content: Uint8Array | ReadableStream<Uint8Array>
  readonly contentType: string
  readonly fileName: string
}

export type NfeDocumentEligibility = {
  readonly authorizedDocument: boolean
  readonly companyRelated: boolean
  readonly decision: 'PENDING_FREIGHT_AND_CTE_RULES'
  readonly hasOriginalXml: boolean
}

export type NfeDocumentRepositoryPort = {
  downloadXml(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<DownloadNfeDocumentXmlResult>
  get(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<NfeDocumentDetail>
  getEligibility(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<NfeDocumentEligibility>
  list(input: {
    readonly context: CompanyContext
    readonly cursor: string | null
    readonly limit: number
  }): Promise<NfeDocumentPage>
}
