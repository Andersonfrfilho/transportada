/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S7): o worker confere o tamanho do objeto pelo
 * `Content-Length` antes de baixar, e conta os bytes enquanto baixa — um objeto trocado no bucket
 * depois do envio não entra inteiro na memória.
 */
import { describe, expect, test } from 'bun:test'

import { createStorageCargoPreviewReader } from '../../src/cargo-preview/infrastructure/storage-cargo-preview-reader.gateway.js'

const LOCATION = { bucket: 'b', key: 'k', maxBytes: 10 }

function streamOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

function createStorage(input: {
  readonly chunks?: readonly Uint8Array[]
  readonly contentLength?: number
}) {
  const calls = { get: 0 }
  const storage = {
    getObjectStream: async () => {
      calls.get += 1
      return streamOf(input.chunks ?? [])
    },
    headObject: async () =>
      input.contentLength === undefined ? undefined : { contentLength: input.contentLength },
  }
  return { calls, reader: createStorageCargoPreviewReader({ storage }) }
}

describe('a leitura do objeto da prévia (spec 237, segurança S7)', () => {
  test('objeto dentro do teto é lido inteiro', async () => {
    const { reader } = createStorage({
      chunks: [new Uint8Array([1, 2]), new Uint8Array([3])],
      contentLength: 3,
    })
    expect(await reader.read(LOCATION)).toEqual(new Uint8Array([1, 2, 3]))
  })

  test('Content-Length acima do teto é recusado sem baixar', async () => {
    const { calls, reader } = createStorage({ contentLength: 11 })
    expect(await reader.read(LOCATION)).toBe('PREVIEW_FILE_TOO_LARGE')
    expect(calls.get).toBe(0)
  })

  test('o fluxo que passa do teto (objeto trocado depois do head) para no meio', async () => {
    const { reader } = createStorage({
      chunks: [new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)],
      contentLength: 5,
    })
    expect(await reader.read(LOCATION)).toBe('PREVIEW_FILE_TOO_LARGE')
  })

  test('objeto ausente é undefined, sem baixar', async () => {
    const { calls, reader } = createStorage({})
    expect(await reader.read(LOCATION)).toBeUndefined()
    expect(calls.get).toBe(0)
  })
})
