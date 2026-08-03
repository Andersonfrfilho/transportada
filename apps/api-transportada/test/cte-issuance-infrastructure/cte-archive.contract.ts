/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { unzipSync } from 'fflate'
import { describe, expect, test } from 'bun:test'

import type { CteArchiveEntry } from '../../src/cte-issuance/application/export-cte-documents.port.js'
import { createCteArchiveGateway } from '../../src/cte-issuance/infrastructure/cte-archive.gateway.js'

const BUCKET = 'fiscal-documents-test'

/** Chave sintética: 44 dígitos derivados de um sequencial, nunca uma chave fiscal real. */
function syntheticAccessKey(sequence: number): string {
  return `${'0'.repeat(40)}${String(sequence).padStart(4, '0')}`
}

function syntheticEntry(sequence: number): CteArchiveEntry {
  return {
    bucket: BUCKET,
    name: `${syntheticAccessKey(sequence)}.xml`,
    objectKey: `cte/${syntheticAccessKey(sequence)}.xml`,
  }
}

/** XML sintético, sem dado fiscal: o gateway só move bytes opacos do storage para o ZIP. */
function syntheticXml(sequence: number): string {
  return `<cteProc sequencia="${sequence}"><infCte/></cteProc>`
}

type StorageStub = {
  readonly getObjectStream: (input: {
    readonly bucket: string
    readonly key: string
  }) => Promise<ReadableStream<Uint8Array>>
  readonly openKeys: readonly string[]
  readonly maxOpenStreams: () => number
}

function createStorageStub(input: { readonly failOnKey?: string } = {}): StorageStub {
  const openKeys: string[] = []
  let open = 0
  let maxOpen = 0

  return {
    async getObjectStream(location) {
      openKeys.push(location.key)
      if (location.key === input.failOnKey) throw new Error('STORAGE_OBJECT_UNAVAILABLE')
      open += 1
      maxOpen = Math.max(maxOpen, open)
      const sequence = openKeys.length
      return new ReadableStream<Uint8Array>({
        start(controller) {
          const bytes = new TextEncoder().encode(syntheticXml(sequence))
          controller.enqueue(bytes.slice(0, 4))
          controller.enqueue(bytes.slice(4))
          open -= 1
          controller.close()
        },
      })
    },
    maxOpenStreams: () => maxOpen,
    openKeys,
  }
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

describe('CT-e XML archive gateway contract', () => {
  test('monta um ZIP legível com uma entrada por chave de acesso', async () => {
    const storage = createStorageStub()
    const gateway = createCteArchiveGateway({ storage })
    const entries = [syntheticEntry(1), syntheticEntry(2)]

    const archive = unzipSync(await collect(await gateway.createArchive(entries)))

    expect(Object.keys(archive).sort()).toEqual([entries[0]!.name, entries[1]!.name])
    expect(new TextDecoder().decode(archive[entries[0]!.name])).toBe(syntheticXml(1))
    expect(new TextDecoder().decode(archive[entries[1]!.name])).toBe(syntheticXml(2))
  })

  test('lê um objeto por vez em vez de carregar a coleção inteira', async () => {
    const storage = createStorageStub()
    const gateway = createCteArchiveGateway({ storage })
    const entries = [syntheticEntry(1), syntheticEntry(2), syntheticEntry(3)]

    await collect(await gateway.createArchive(entries))

    expect(storage.openKeys).toEqual(entries.map((entry) => entry.objectKey))
    expect(storage.maxOpenStreams()).toBe(1)
  })

  test('falha do storage interrompe o fluxo em vez de entregar ZIP truncado', async () => {
    const entries = [syntheticEntry(1), syntheticEntry(2)]
    const storage = createStorageStub({ failOnKey: entries[1]!.objectKey })
    const gateway = createCteArchiveGateway({ storage })

    const stream = await gateway.createArchive(entries)

    await expect(collect(stream)).rejects.toThrow('STORAGE_OBJECT_UNAVAILABLE')
  })
})
