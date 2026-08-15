/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Arquiva o documento fiscal da NFS-e no bucket. A chave é por empresa e por documento do provedor,
 * e a escrita é sempre `create-only`: reprocessar a mesma nota não sobrescreve o que já foi gravado
 * — é o que mantém a reconciliação idempotente do lado do storage.
 */
import { createHash } from 'node:crypto'

import type {
  NfseDocumentStoragePort,
  NfseStoredDocument,
} from '../application/nfse-document-storage.port.js'
import type { NfseDocumentKind } from '../application/nfse-fiscal-status.port.js'

const DOCUMENT_FILE_NAME: Readonly<Record<NfseDocumentKind, string>> = {
  pdf: 'nota.pdf',
  xml: 'authorized.xml',
}

const DOCUMENT_MEDIA_TYPE: Readonly<Record<NfseDocumentKind, string>> = {
  pdf: 'application/pdf',
  xml: 'application/xml',
}

export type NfseObjectPutInput = {
  readonly body: Uint8Array
  readonly bucket: string
  readonly contentLength: number
  readonly contentType: string
  readonly key: string
  readonly mode: 'create-only'
  readonly sha256: string
}

export type NfseObjectStoragePutPort = {
  put(input: NfseObjectPutInput): Promise<unknown>
}

export function createNfseFiscalDocumentStorage(dependencies: {
  readonly bucket: string
  readonly provider: NfseObjectStoragePutPort
}): NfseDocumentStoragePort {
  return {
    async store(input): Promise<NfseStoredDocument> {
      const key = buildObjectKey(input)
      const sha256 = createHash('sha256').update(input.bytes).digest('hex')

      await dependencies.provider.put({
        body: input.bytes,
        bucket: dependencies.bucket,
        contentLength: input.bytes.byteLength,
        contentType: DOCUMENT_MEDIA_TYPE[input.kind],
        key,
        mode: 'create-only',
        sha256,
      })

      return {
        bucket: dependencies.bucket,
        key,
        objectId: crypto.randomUUID(),
        sha256,
        sizeBytes: input.bytes.byteLength,
      }
    },
  }
}

function buildObjectKey(input: {
  readonly companyId: string
  readonly kind: NfseDocumentKind
  readonly providerDocumentId: string
}): string {
  return `tenants/${input.companyId}/nfse-documents/${input.providerDocumentId}/${DOCUMENT_FILE_NAME[input.kind]}`
}
