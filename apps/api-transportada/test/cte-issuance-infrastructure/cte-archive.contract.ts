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
    name: `${syntheticAccessKey(sequence)}.xml`,
    source: {
      bucket: BUCKET,
      kind: 'object',
      objectKey: `cte/${syntheticAccessKey(sequence)}.xml`,
    },
  }
}

function entryObjectKey(entry: CteArchiveEntry): string {
  if (entry.source.kind !== 'object') throw new Error('entrada não vem do storage')
  return entry.source.objectKey
}

/** PDF sintético: o gateway só empacota os bytes que a entrada devolve. */
function syntheticPdf(sequence: number): string {
  return `%PDF-1.3 sintetico ${sequence}`
}

function syntheticPdfBytes(sequence: number): Uint8Array {
  return new TextEncoder().encode(syntheticPdf(sequence))
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

    expect(storage.openKeys).toEqual(entries.map(entryObjectKey))
    expect(storage.maxOpenStreams()).toBe(1)
  })

  test('entrada gerada sob demanda entra no ZIP com os bytes que ela devolve', async () => {
    const storage = createStorageStub()
    const gateway = createCteArchiveGateway({ storage })
    const xmlEntry = syntheticEntry(1)
    const pdfEntry: CteArchiveEntry = {
      name: `${syntheticAccessKey(1)}.pdf`,
      source: { kind: 'lazy', load: async () => syntheticPdfBytes(1) },
    }

    const archive = unzipSync(await collect(await gateway.createArchive([xmlEntry, pdfEntry])))

    expect(Object.keys(archive).sort()).toEqual([pdfEntry.name, xmlEntry.name])
    expect(new TextDecoder().decode(archive[pdfEntry.name])).toBe(syntheticPdf(1))
  })

  test('gera um documento por vez em vez de renderizar a seleção inteira', async () => {
    const storage = createStorageStub()
    const gateway = createCteArchiveGateway({ storage })
    const loadOrder: number[] = []
    let open = 0
    let maxOpen = 0
    const entries: readonly CteArchiveEntry[] = [1, 2, 3].map((sequence) => ({
      name: `${syntheticAccessKey(sequence)}.pdf`,
      source: {
        kind: 'lazy',
        load: async () => {
          open += 1
          maxOpen = Math.max(maxOpen, open)
          loadOrder.push(sequence)
          open -= 1
          return syntheticPdfBytes(sequence)
        },
      },
    }))

    await collect(await gateway.createArchive(entries))

    expect(loadOrder).toEqual([1, 2, 3])
    expect(maxOpen).toBe(1)
  })

  test('falha ao gerar um documento interrompe o fluxo em vez de entregar ZIP truncado', async () => {
    const storage = createStorageStub()
    const gateway = createCteArchiveGateway({ storage })
    const entries: readonly CteArchiveEntry[] = [
      syntheticEntry(1),
      {
        name: `${syntheticAccessKey(2)}.pdf`,
        source: {
          kind: 'lazy',
          load: async () => {
            throw new Error('DACTE_RENDER_FAILED')
          },
        },
      },
    ]

    const stream = await gateway.createArchive(entries)

    await expect(collect(stream)).rejects.toThrow('DACTE_RENDER_FAILED')
  })

  test('falha do storage interrompe o fluxo em vez de entregar ZIP truncado', async () => {
    const entries = [syntheticEntry(1), syntheticEntry(2)]
    const storage = createStorageStub({ failOnKey: entryObjectKey(entries[1]!) })
    const gateway = createCteArchiveGateway({ storage })

    const stream = await gateway.createArchive(entries)

    await expect(collect(stream)).rejects.toThrow('STORAGE_OBJECT_UNAVAILABLE')
  })
})
