/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AttachmentObjectReaderPort } from '../application/extract-attachment-fields.port.js'

type StorageGateway = Readonly<{
  getObjectStream: (input: {
    readonly bucket: string
    readonly key: string
  }) => Promise<ReadableStream<Uint8Array>>
}>

/**
 * Objeto ausente é `undefined`, não exceção: entre o `201` e esta leitura alguém pode ter apagado o
 * arquivo, e isso é fato do mundo — o consumidor fecha a mensagem em vez de reciclar para sempre uma
 * leitura que nunca vai acontecer.
 */
export function createStorageAttachmentReaderGateway(dependencies: {
  readonly storage: StorageGateway
}): AttachmentObjectReaderPort {
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
  }
}
