/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ArchivedInvoiceDocument,
  InvoiceDocumentArchivePort,
} from '../application/invoice-document.port.js'

const DOWNLOAD_EXPIRES_IN_SECONDS = 300
const STORAGE_PROVIDER = 'object-storage'

type ObjectStorageGateway = {
  readonly createSignedDownload: (input: {
    readonly bucket: string
    readonly expiresInSeconds: number
    readonly key: string
    readonly disposition?: 'inline' | 'attachment'
    readonly filename?: string
  }) => Promise<URL>
  readonly storeObject: (input: {
    readonly body: Uint8Array
    readonly bucket: string
    readonly contentLength: number
    readonly contentType: string
    readonly key: string
    readonly sha256: string
  }) => Promise<unknown>
}

export function buildBillingDocumentObjectKey(input: {
  readonly companyId: string
  readonly invoiceId: string
  readonly objectId: string
}): string {
  return `tenants/${input.companyId}/billing-invoices/${input.invoiceId}/pdf/${input.objectId}.pdf`
}

export function createInvoiceDocumentArchiveGateway(input: {
  readonly bucket: string
  readonly expiresInSeconds?: number
  readonly now?: () => Date
  readonly storage: ObjectStorageGateway
}): InvoiceDocumentArchivePort {
  const expiresInSeconds = input.expiresInSeconds ?? DOWNLOAD_EXPIRES_IN_SECONDS
  const now = input.now ?? (() => new Date())

  return {
    async createDownloadUrl(location) {
      const url = await input.storage.createSignedDownload({
        bucket: location.bucket,
        disposition: 'attachment',
        expiresInSeconds,
        filename: location.fileName,
        key: location.key,
      })

      return {
        expiresAt: new Date(now().getTime() + expiresInSeconds * 1000).toISOString(),
        url: url.toString(),
      }
    },
    async put(document): Promise<ArchivedInvoiceDocument> {
      const objectKey = buildBillingDocumentObjectKey({
        companyId: document.companyId,
        invoiceId: document.invoiceId,
        objectId: document.objectId,
      })

      await input.storage.storeObject({
        body: document.bytes,
        bucket: input.bucket,
        contentLength: document.bytes.byteLength,
        contentType: document.contentType,
        key: objectKey,
        sha256: document.sha256,
      })

      return { bucket: input.bucket, objectKey, provider: STORAGE_PROVIDER }
    },
  }
}
