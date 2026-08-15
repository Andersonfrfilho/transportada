/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Montagem de ZIP em stream, compartilhada por todo documento fiscal que sai em lote. O CT-e e a
 * NFS-e pedem o mesmo arquivo com fontes diferentes: manter duas cópias do laço faria a correção de
 * um vazamento de stream valer só para metade das rotas.
 */
import { Zip, ZipPassThrough } from 'fflate'

export type ArchiveSource =
  | { readonly bucket: string; readonly kind: 'object'; readonly objectKey: string }
  | { readonly kind: 'lazy'; readonly load: () => Promise<Uint8Array> }

export type ArchiveEntry = {
  readonly name: string
  readonly source: ArchiveSource
}

export type ArchiveObjectStreamGateway = {
  readonly getObjectStream: (input: {
    readonly bucket: string
    readonly key: string
  }) => Promise<ReadableStream<Uint8Array>>
}

const EMPTY_CHUNK = new Uint8Array(0)

/**
 * ZIP em modo `store`: deflate síncrono de centenas de documentos travaria o event loop do
 * `Bun.serve`, e a variante assíncrona abriria um worker por arquivo. XML e PDF já viajam
 * comprimidos no transporte HTTP.
 */
export function createArchiveStream(input: {
  readonly entries: readonly ArchiveEntry[]
  readonly storage: ArchiveObjectStreamGateway
}): ReadableStream<Uint8Array> {
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
      void appendEntries({ controller, entries: input.entries, storage: input.storage, zip })
    },
  })
}

async function appendEntries(input: {
  readonly controller: ReadableStreamDefaultController<Uint8Array>
  readonly entries: readonly ArchiveEntry[]
  readonly storage: ArchiveObjectStreamGateway
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
  readonly entry: ArchiveEntry
  readonly storage: ArchiveObjectStreamGateway
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
