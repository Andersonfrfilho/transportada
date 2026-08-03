/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  InvoiceLayoutInvoice,
  InvoiceLayoutProfile,
  InvoiceLayoutReportRow,
} from '../domain/invoice-layout.policy.js'

export const INVOICE_DOCUMENT_KIND = 'pdf'
export const INVOICE_DOCUMENT_CONTENT_TYPE = 'application/pdf'
export const INVOICE_DOCUMENT_PURPOSE = 'billing_document'
export const INVOICE_DOCUMENT_VERSION = 1n

export type InvoiceDocumentContext = {
  readonly companyId: string
  readonly userId: string
}

export type InvoiceDocumentInvoice = InvoiceLayoutInvoice & {
  readonly companyId: string
  readonly id: string
  readonly observations: string
}

export type InvoiceDocumentRecord = {
  readonly bucket: string
  readonly byteSize: bigint
  readonly documentKind: string
  readonly documentVersion: bigint
  readonly id: string
  readonly mimeType: string
  readonly objectId: string
  readonly objectKey: string
  readonly sha256: string
}

export type ArchivedInvoiceDocument = {
  readonly bucket: string
  readonly objectKey: string
  readonly provider: string
}

export type InvoiceDocumentArchivePort = {
  readonly createDownloadUrl: (input: {
    readonly bucket: string
    readonly fileName: string
    readonly key: string
  }) => Promise<{ readonly expiresAt: string; readonly url: string }>
  readonly put: (input: {
    readonly bytes: Buffer
    readonly companyId: string
    readonly contentType: string
    readonly invoiceId: string
    readonly objectId: string
    readonly sha256: string
  }) => Promise<ArchivedInvoiceDocument>
}

export type InvoiceDocumentLogo = {
  readonly bytes: Buffer
}

export type InvoiceDocumentRendererPort = {
  readonly render: (input: {
    readonly invoice: InvoiceLayoutInvoice
    readonly logo: InvoiceDocumentLogo | null
    readonly observations: string
    readonly printedAt: Date
    readonly profile: InvoiceLayoutProfile | null
    readonly rows: readonly InvoiceLayoutReportRow[]
  }) => Promise<{ readonly bytes: Buffer; readonly pageCount: number }>
}

export type CreateInvoiceDocumentInput = {
  readonly byteSize: bigint
  readonly companyId: string
  readonly documentKind: string
  readonly documentVersion: bigint
  readonly invoiceId: string
  readonly mimeType: string
  readonly objectId: string
  readonly sha256: string
}

export type CreateInvoiceStoredObjectInput = {
  readonly bucket: string
  readonly companyId: string
  readonly id: string
  readonly mimeType: string
  readonly objectKey: string
  readonly provider: string
  readonly purpose: string
  readonly sha256: string
  readonly sizeBytes: bigint
  readonly status: string
}

export type CreateInvoiceDocumentEventInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly eventName: 'document_failed' | 'document_generated'
  readonly invoiceId: string
  readonly payload: Readonly<Record<string, unknown>>
}

export type InvoiceDocumentScope = {
  readonly companyId: string
  readonly invoiceId: string
}

export type InvoiceDocumentRepositoryPort = {
  readonly createInvoiceDocument: (
    input: CreateInvoiceDocumentInput,
  ) => Promise<InvoiceDocumentRecord | null>
  readonly createInvoiceEvent: (input: CreateInvoiceDocumentEventInput) => Promise<void>
  readonly createStoredObject: (input: CreateInvoiceStoredObjectInput) => Promise<void>
  readonly execute?: <TResponse>(
    operation: (transaction: InvoiceDocumentRepositoryPort) => Promise<TResponse>,
  ) => Promise<TResponse>
  readonly findCompanyLogo: (input: {
    readonly companyId: string
  }) => Promise<InvoiceDocumentLogo | null>
  readonly findFiscalProfile: (input: {
    readonly companyId: string
  }) => Promise<InvoiceLayoutProfile | null>
  readonly findInvoice: (input: InvoiceDocumentScope) => Promise<InvoiceDocumentInvoice | null>
  readonly findInvoiceDocument: (
    input: InvoiceDocumentScope & { readonly documentKind: string },
  ) => Promise<InvoiceDocumentRecord | null>
  readonly findInvoiceReportRows: (
    input: InvoiceDocumentScope,
  ) => Promise<readonly InvoiceLayoutReportRow[]>
  readonly listInvoiceDocuments: (
    input: InvoiceDocumentScope,
  ) => Promise<readonly InvoiceDocumentRecord[]>
}

export type InvoiceDocumentView = {
  readonly byteSize: number
  readonly contentType: string
  readonly documentId: string
  readonly documentType: string
  readonly downloadUrl: string
  readonly expiresAt: string
  readonly sha256: string
}

export type InvoiceDocumentPage = {
  readonly items: readonly InvoiceDocumentView[]
  readonly nextCursor: string | null
}

export type InvoiceDocumentRequest = {
  readonly context: InvoiceDocumentContext
  readonly invoiceId: string
}
