/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Adapta o `NfeStorageGateway` (bucket do ambiente, o mesmo de importação/documentos fiscais —
 * spec 154 D3 não pede bucket próprio) ao `TollBoothExtractStoragePort`, mapeando o conflito de
 * `create-only` do provider para o erro de domínio do módulo (code-standart §7: nunca erro cru).
 */
import {
  OBJECT_STORAGE_ERROR_CODES,
  ObjectStorageError,
} from '@adatechnology/object-storage-provider'

import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'
import {
  TollBoothExtractIntegrityError,
  TollBoothExtractObjectConflictError,
} from '../domain/toll-booth-extract.error.js'
import type {
  PutExtractObjectInput,
  PutExtractObjectResult,
  ReadExtractObjectInput,
  TollBoothExtractStoragePort,
} from '../application/toll-booth-extract.port.js'

const EXTRACT_CONTENT_TYPE = 'application/json'

export function createTollBoothExtractStorageGateway(dependencies: {
  readonly bucket: string
  readonly storage: NfeStorageGateway
}): TollBoothExtractStoragePort {
  return {
    async head(key: string): Promise<Readonly<{ contentLength: number }> | undefined> {
      const stored = await dependencies.storage.headObject({ bucket: dependencies.bucket, key })
      return stored === undefined ? undefined : { contentLength: stored.contentLength }
    },
    async read(input: ReadExtractObjectInput): Promise<Uint8Array> {
      const stream = await dependencies.storage.getObjectStream({
        bucket: dependencies.bucket,
        key: input.key,
      })
      return readBoundedBytes({ maxBytes: input.maxBytes, stream })
    },
    async putCreateOnly(input: PutExtractObjectInput): Promise<PutExtractObjectResult> {
      try {
        const stored = await dependencies.storage.storeObject({
          body: input.body,
          bucket: dependencies.bucket,
          contentLength: input.contentLength,
          contentType: EXTRACT_CONTENT_TYPE,
          key: input.key,
          sha256: input.sha256,
        })
        return { disposition: stored.disposition }
      } catch (error) {
        if (
          error instanceof ObjectStorageError &&
          error.code === OBJECT_STORAGE_ERROR_CODES.objectConflict
        ) {
          throw new TollBoothExtractObjectConflictError()
        }
        throw error
      }
    },
  }
}

/** O `head` já recusou o grande; isto protege contra o objeto trocado entre o `head` e o `get`. */
async function readBoundedBytes(input: {
  readonly maxBytes: number
  readonly stream: ReadableStream<Uint8Array>
}): Promise<Uint8Array> {
  const reader = input.stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.byteLength
    if (size > input.maxBytes) {
      await reader.cancel()
      throw new TollBoothExtractIntegrityError()
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
