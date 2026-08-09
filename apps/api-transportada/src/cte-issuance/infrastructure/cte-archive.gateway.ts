/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { Zip, ZipPassThrough } from 'fflate'

import type { CteArchiveEntry, CteArchivePort } from '../application/export-cte-documents.port.js'

type ObjectStreamGateway = {
  readonly getObjectStream: (input: {
    readonly bucket: string
    readonly key: string
  }) => Promise<ReadableStream<Uint8Array>>
}

const EMPTY_CHUNK = new Uint8Array(0)

/**
 * ZIP em modo `store`: deflate síncrono de centenas de XMLs travaria o event loop do `Bun.serve`, e a
 * variante assíncrona abriria um worker por arquivo. XML já comprime bem no transporte HTTP.
 */
export function createCteArchiveGateway(input: {
  readonly storage: ObjectStreamGateway
}): CteArchivePort {
  return {
    async createArchive(entries: readonly CteArchiveEntry[]): Promise<ReadableStream<Uint8Array>> {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          const zip = new Zip((error, chunk, final) => {
            if (error !== null) {
              controller.error(error)
              return
            }
            controller.enqueue(chunk)
            if (final) controller.close()
          })
          void appendEntries({ controller, entries, storage: input.storage, zip })
        },
      })
    },
  }
}

async function appendEntries(input: {
  readonly controller: ReadableStreamDefaultController<Uint8Array>
  readonly entries: readonly CteArchiveEntry[]
  readonly storage: ObjectStreamGateway
  readonly zip: Zip
}): Promise<void> {
  try {
    for (const entry of input.entries) {
      // Sequencial de propósito: baixar tudo em paralelo materializaria a coleção inteira em memória.
      await appendEntry({ entry, storage: input.storage, zip: input.zip })
    }
    input.zip.end()
  } catch (error) {
    input.zip.terminate()
    input.controller.error(error)
  }
}

async function appendEntry(input: {
  readonly entry: CteArchiveEntry
  readonly storage: ObjectStreamGateway
  readonly zip: Zip
}): Promise<void> {
  const { source } = input.entry
  if (source.kind === 'lazy') {
    // Gerar antes de `add` mantém o ZIP intacto se a renderização falhar: o arquivo nem é aberto.
    const bytes = await source.load()
    const file = new ZipPassThrough(input.entry.name)
    input.zip.add(file)
    file.push(bytes, true)
    return
  }

  const file = new ZipPassThrough(input.entry.name)
  input.zip.add(file)
  const stream = await input.storage.getObjectStream({
    bucket: source.bucket,
    key: source.objectKey,
  })
  const reader = stream.getReader()
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      file.push(chunk.value, false)
    }
  } finally {
    reader.releaseLock()
  }
  file.push(EMPTY_CHUNK, true)
}
