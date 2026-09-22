/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20. Guarda e lê o demonstrativo no bucket, e lê as fotos que entram nele. Molde de
 * `billing/infrastructure/invoice-document-archive.gateway.ts`.
 */
import type { OccurrenceStatementArchivePort } from '../application/occurrence-statement.port.js'
import { buildOccurrenceStatementObjectKey } from './drizzle-occurrence-statement.repository.js'

const STORAGE_PROVIDER = 'object-storage'

type ObjectStorageGateway = {
  readonly getObjectStream: (input: {
    readonly bucket: string
    readonly key: string
  }) => Promise<ReadableStream<Uint8Array>>
  readonly storeObject: (input: {
    readonly body: Uint8Array
    readonly bucket: string
    readonly contentLength: number
    readonly contentType: string
    readonly key: string
    readonly sha256: string
  }) => Promise<unknown>
}

export function createOccurrenceStatementArchiveGateway(input: {
  readonly bucket: string
  readonly storage: ObjectStorageGateway
}): OccurrenceStatementArchivePort {
  return {
    async loadObject(location): Promise<Uint8Array | null> {
      try {
        const stream = await input.storage.getObjectStream({
          bucket: location.bucket,
          key: location.objectKey,
        })
        return new Uint8Array(await new Response(stream).arrayBuffer())
      } catch {
        /** Objeto que sumiu do bucket vira selo textual — nunca derruba a geração nem a leitura. */
        return null
      }
    },
    async put(document) {
      const objectKey = buildOccurrenceStatementObjectKey({
        batchId: document.batchId,
        companyId: document.companyId,
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
