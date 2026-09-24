/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Dublê em memória do `ObjectStorageProvider` para os testes de integração — o CI deixou de subir o
 * MinIO depois que a MinIO tirou as imagens públicas (2026-09-24). As regras são as do provedor
 * real (`@adatechnology/object-storage-provider` 0.3.0), lidas do código dele: gravação só cria,
 * mesmo SHA-256 devolve `replayed`, conteúdo diferente é conflito, chave ausente é `unavailable`.
 *
 * ⚠️ O que ele NÃO prova: o comportamento do S3 de verdade — rede, assinatura de URL, stream que
 * chega em pedaços do socket. O `get` entrega em blocos de 64 KiB para o consumidor continuar
 * lidando com mais de um pedaço, mas o tamanho do bloco é nosso, não do servidor.
 */
import { createHash } from 'node:crypto'

import {
  OBJECT_STORAGE_ERROR_CODES,
  ObjectStorageError,
  type ObjectBody,
  type ObjectStorageProvider,
  type StoredObject,
} from '@adatechnology/object-storage-provider'

const CHUNK_BYTES = 64 * 1024
const SHA256_PATTERN = /^[0-9a-f]{64}$/u
const SIGNED_URL_BASE = 'https://object-storage.test/'

type StoredEntry = Readonly<{ bytes: Uint8Array; object: StoredObject }>

function fail(code: keyof typeof OBJECT_STORAGE_ERROR_CODES, message: string): never {
  throw new ObjectStorageError(OBJECT_STORAGE_ERROR_CODES[code], message)
}

async function readBody(body: ObjectBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return new Uint8Array(body)
  return new Uint8Array(await new Response(body).arrayBuffer())
}

function toChunkedStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + CHUNK_BYTES))
      offset += CHUNK_BYTES
    },
  })
}

export function createInMemoryObjectStorageProvider(
  input: Readonly<{ maxObjectSizeBytes: number }>,
): ObjectStorageProvider {
  const entries = new Map<string, StoredEntry>()
  const locate = (location: { bucket: string; key: string }): string =>
    `${location.bucket}/${location.key}`

  return {
    async put(putInput) {
      if (putInput.contentLength > input.maxObjectSizeBytes) {
        fail('objectTooLarge', 'Object exceeds the configured size limit')
      }
      if (!SHA256_PATTERN.test(putInput.sha256))
        fail('sha256Mismatch', 'Object SHA-256 does not match')
      const bytes = await readBody(putInput.body)
      if (bytes.byteLength !== putInput.contentLength) {
        fail('contentLengthMismatch', 'Object content length does not match')
      }
      if (createHash('sha256').update(bytes).digest('hex') !== putInput.sha256) {
        fail('sha256Mismatch', 'Object SHA-256 does not match')
      }

      const existing = entries.get(locate(putInput))
      if (existing !== undefined) {
        if (existing.object.sha256 === putInput.sha256) {
          return { ...existing.object, disposition: 'replayed' }
        }
        fail('objectConflict', 'Object already exists with different content')
      }
      const object: StoredObject = {
        bucket: putInput.bucket,
        contentLength: putInput.contentLength,
        contentType: putInput.contentType,
        key: putInput.key,
        provider: 's3',
        sha256: putInput.sha256,
      }
      entries.set(locate(putInput), { bytes, object })
      return { ...object, disposition: 'created' }
    },
    async get(getInput) {
      const entry = entries.get(locate(getInput))
      if (entry === undefined) fail('unavailable', 'Object storage is unavailable')
      return toChunkedStream(entry.bytes)
    },
    async head(headInput) {
      return entries.get(locate(headInput))?.object
    },
    async delete(deleteInput) {
      entries.delete(locate(deleteInput))
    },
    async createSignedDownload(signedInput) {
      return new URL(
        `${SIGNED_URL_BASE}${locate(signedInput)}?expires=${signedInput.expiresInSeconds}`,
      )
    },
    async createSignedUpload(signedInput) {
      return new URL(
        `${SIGNED_URL_BASE}${locate(signedInput)}?upload=${signedInput.expiresInSeconds}`,
      )
    },
    async health() {
      return { status: 'up' }
    },
    async close() {},
  }
}
