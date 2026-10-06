/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoPreviewObjectReaderPort } from '../application/cargo-preview-worker.port.js'

type StorageGateway = Readonly<{
  getObjectStream: (input: {
    readonly bucket: string
    readonly key: string
  }) => Promise<ReadableStream<Uint8Array>>
}>

/**
 * Objeto ausente é `undefined`: entre o envio e a leitura alguém pode ter apagado o arquivo, e
 * reciclar a mensagem para sempre não traz o arquivo de volta. O tamanho já foi limitado na API e
 * o leitor confere de novo.
 */
export function createStorageCargoPreviewReader(dependencies: {
  readonly storage: StorageGateway
}): CargoPreviewObjectReaderPort {
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
