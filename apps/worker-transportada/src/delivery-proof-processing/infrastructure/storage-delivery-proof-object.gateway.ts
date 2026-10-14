/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DeliveryProofObjectStoragePort } from '../application/delivery-proof-processing.port.js'
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'

type Storage = Pick<NfeStorageGateway, 'deleteObject' | 'getObjectStream' | 'storeObject'>

/**
 * Leitura de objeto ausente é `undefined` (o original pode ter sido apagado entre o `201` e o
 * tratamento); o consumidor decide o que isso significa. Escrita é `create-only` com SHA-256: o mesmo
 * conteúdo repetido é `replayed`, conteúdo diferente na mesma chave é conflito e rejeita.
 */
export function createStorageDeliveryProofObjectGateway(dependencies: {
  readonly storage: Storage
}): DeliveryProofObjectStoragePort {
  return {
    async read({ bucket, key }) {
      let stream: ReadableStream<Uint8Array>
      try {
        stream = await dependencies.storage.getObjectStream({ bucket, key })
      } catch {
        return undefined
      }
      return new Uint8Array(await new Response(stream).arrayBuffer())
    },

    async remove({ bucket, key }) {
      await dependencies.storage.deleteObject({ bucket, key })
    },

    async store({ bucket, bytes, key, mimeType, sha256 }) {
      await dependencies.storage.storeObject({
        body: bytes,
        bucket,
        contentLength: bytes.byteLength,
        contentType: mimeType,
        key,
        sha256,
      })
    },
  }
}
