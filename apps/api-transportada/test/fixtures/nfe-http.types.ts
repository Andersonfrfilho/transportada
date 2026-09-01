/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ScheduledDistributionStatus } from '../../src/companies/application/get-scheduled-distribution-status.use-case'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'
import type { TripLocationByAccessKey } from '../../src/trips/application/find-trip-location-by-access-key.use-case'
import type {
  JobRunSnapshot,
  NfeDistributionStatus,
  NfeImportDetail,
  NfeImportSummary,
} from '../../src/nfe-imports/application/nfe-import.types'

export type UploadFileDescriptor = {
  readonly bytes: Uint8Array
  readonly contentType: string
  readonly name: string
  readonly sha256: string
}

export type RequestUploadCall = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly files: readonly UploadFileDescriptor[]
  readonly idempotencyKey: string
}

export type RequestDistributionCall = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
}

export type ListImportsCall = {
  readonly context: CompanyContext
  readonly cursor: string | null
  readonly limit: number
}

export type GetImportCall = {
  readonly context: CompanyContext
  readonly importId: string
}

export type GetDistributionStatusCall = {
  readonly context: CompanyContext
}

export type ReprocessImportCall = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly importId: string
}

export type NfeDocumentSummary = {
  readonly accessKey: string
  readonly cteBlockReason: string | null
  readonly nfseBlockReason: string | null
  readonly emitterAddress: string | null
  readonly emitterCity: string | null
  readonly emitterCityCode: string | null
  readonly emitterName: string
  readonly emitterState: string | null
  readonly emitterTaxId: string | null
  readonly id: string
  readonly issuedAt: string
  readonly nfseInvoiceId: string | null
  readonly nfseInvoiceNumber: string | null
  readonly number: string
  readonly recipientAddress: string | null
  readonly recipientCity: string | null
  readonly recipientCityCode: string | null
  readonly recipientName: string
  readonly recipientState: string | null
  readonly recipientTaxId: string | null
  readonly series: string
  readonly status: 'authorized' | 'cancelled' | 'denied'
  readonly totalAmount: string
  /** Spec 065 D4b — o mesmo par que o tipo da aplicação e o das rotas declaram. */
  readonly tripId: string | null
  readonly tripStatus: string | null
  readonly variant: 'complete' | 'summary' | 'event'
}

export type NfeDocumentDetail = NfeDocumentSummary

export type ListDocumentsCall = {
  readonly accessKey: string | null
  readonly context: CompanyContext
  readonly cursor: string | null
  readonly limit: number
}

export type GetDocumentCall = {
  readonly context: CompanyContext
  readonly documentId: string
}

export type DownloadDocumentXmlCall = {
  readonly context: CompanyContext
  readonly documentId: string
}

export type DownloadDocumentXmlResult = {
  readonly accessKey: string
  readonly content: Uint8Array
  readonly contentType: string
  readonly fileName: string
}

export type NfeDocumentEligibility = {
  readonly authorizedDocument: boolean
  readonly companyRelated: boolean
  readonly decision: 'PENDING_FREIGHT_AND_CTE_RULES'
  readonly hasOriginalXml: boolean
}

export type NfeHttpRouteDependencies = {
  readonly downloadDocumentXml: {
    execute(input: DownloadDocumentXmlCall): Promise<DownloadDocumentXmlResult>
  }
  readonly getDocument: {
    execute(input: GetDocumentCall): Promise<NfeDocumentDetail>
  }
  readonly getEligibility?: {
    execute(input: GetDocumentCall): Promise<NfeDocumentEligibility>
  }
  readonly getDistributionStatus: {
    execute(input: GetDistributionStatusCall): Promise<NfeDistributionStatus>
  }
  readonly getLastJobRun: {
    execute(input: GetDistributionStatusCall): Promise<JobRunSnapshot | null>
  }
  readonly getImport: {
    execute(input: GetImportCall): Promise<NfeImportDetail>
  }
  readonly getScheduledDistribution: {
    execute(input: { readonly companyId: string }): Promise<ScheduledDistributionStatus>
  }
  readonly listDocuments: {
    execute(input: ListDocumentsCall): Promise<{
      readonly items: readonly NfeDocumentSummary[]
      readonly nextCursor: string | null
    }>
  }
  readonly locateTripByAccessKey: {
    execute(input: { readonly accessKey: string }): Promise<TripLocationByAccessKey | null>
  }
  readonly listImports: {
    execute(input: ListImportsCall): Promise<{
      readonly items: readonly NfeImportSummary[]
      readonly nextCursor: string | null
    }>
  }
  readonly reprocessImport: {
    execute(input: ReprocessImportCall): Promise<NfeImportSummary>
  }
  readonly requestDistribution: {
    execute(input: RequestDistributionCall): Promise<NfeImportSummary>
  }
  readonly requestUpload: {
    execute(input: RequestUploadCall): Promise<NfeImportSummary>
  }
}
