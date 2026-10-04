/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoPreviewObjectReaderPort } from '../application/cargo-preview-worker.port.js'

type StorageGateway = Readonly<{
  getObjectStream: (input: {
    readonly bucket: string
    readonly key: string
  }) => Promise<ReadableStream<Uint8Array>>
  headObject: (input: {
    readonly bucket: string
    readonly key: string
  }) => Promise<{ readonly contentLength: number } | undefined>
}>

const TOO_LARGE = 'PREVIEW_FILE_TOO_LARGE'

function concatenate(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

/** Conta enquanto baixa: o objeto pode ter sido trocado depois do `head`. */
async function readCounted(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array | typeof TOO_LARGE> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.length
    if (size > maxBytes) {
      await reader.cancel()
      return TOO_LARGE
    }
    chunks.push(next.value)
  }
  return concatenate(chunks, size)
}

/**
 * Objeto ausente é `undefined`: entre o envio e a leitura alguém pode ter apagado o arquivo, e
 * reciclar a mensagem para sempre não traz o arquivo de volta. Acima do teto do envio (revisão de
 * segurança S7), o objeto nem é baixado.
 */
export function createStorageCargoPreviewReader(dependencies: {
  readonly storage: StorageGateway
}): CargoPreviewObjectReaderPort {
  return {
    async read({ bucket, key, maxBytes }) {
      const head = await dependencies.storage.headObject({ bucket, key }).catch(() => undefined)
      if (head === undefined) return undefined
      if (head.contentLength > maxBytes) return TOO_LARGE
      let stream: ReadableStream<Uint8Array>
      try {
        stream = await dependencies.storage.getObjectStream({ bucket, key })
      } catch {
        return undefined
      }
      return readCounted(stream, maxBytes)
    },
  }
}
