/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseDocumentKind } from './nfse-fiscal-status.port.js'

export type NfseStoredDocument = {
  readonly bucket: string
  readonly key: string
  readonly objectId: string
  readonly sha256: string
  readonly sizeBytes: number
}

export type NfseDocumentStoragePort = {
  store(input: {
    readonly bytes: Uint8Array
    readonly companyId: string
    readonly kind: NfseDocumentKind
    readonly providerDocumentId: string
  }): Promise<NfseStoredDocument>
}
