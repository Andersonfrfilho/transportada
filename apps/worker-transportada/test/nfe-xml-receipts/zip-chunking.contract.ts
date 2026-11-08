/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301 RN3: volume não recusa, enfileira. Um zip com mais notas do que o expansor aceita de uma vez é fatiado antes
 * de entrar na fila; o que é suspeito segue inteiro para o expansor recusar com o código exato.
 */
import { describe, expect, test } from 'bun:test'
import { strToU8, unzipSync, zipSync } from 'fflate'

import { createNfeImportArchiveExpander } from '../../src/nfe-imports/infrastructure/nfe-import-archive-expander.gateway.js'
import { chunkOversizedZip } from '../../src/nfe-xml-receipts/domain/zip-queue-chunking.policy.js'

function zipWith(count: number, namePrefix = 'nota'): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  for (let index = 0; index < count; index += 1) {
    files[`${namePrefix}-${String(index).padStart(5, '0')}.xml`] = strToU8(
      `<nfeProc><NFe>${index}</NFe></nfeProc>`,
    )
  }
  return zipSync(files)
}

describe('zip chunking before the queue', () => {
  test('a zip within the importer limits goes through untouched', () => {
    const file = { bytes: zipWith(50), name: 'notas.zip' }
    expect(chunkOversizedZip(file)).toEqual([file])
  })

  test('a loose xml and a non-zip are never touched', () => {
    const xml = { bytes: strToU8('<a/>'), name: 'a.xml' }
    expect(chunkOversizedZip(xml)).toEqual([xml])
  })

  test('5 thousand notes become small zips, every note exactly once, each one importable by the real expander', async () => {
    const original = zipWith(5000)
    const chunks = chunkOversizedZip({ bytes: original, name: 'mes.zip' })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map((chunk) => chunk.name).slice(0, 2)).toEqual([
      'mes-parte-001.zip',
      'mes-parte-002.zip',
    ])

    const expander = createNfeImportArchiveExpander()
    const seen: string[] = []
    for (const chunk of chunks) {
      const expanded = await expander.expand({
        contentType: 'application/zip',
        sourceBytes: chunk.bytes,
        sourceEntry: '/',
        sourceName: chunk.name,
      })
      expect(expanded.length).toBeLessThanOrEqual(400)
      seen.push(...expanded.map((entry) => entry.entryName))
    }
    expect(seen).toHaveLength(5000)
    expect(new Set(seen).size).toBe(5000)
    expect(Object.keys(unzipSync(original)).sort()).toEqual([...seen].sort())
  })

  test('the real expander would have refused the same zip whole (why the slicing exists)', async () => {
    await expect(
      createNfeImportArchiveExpander().expand({
        contentType: 'application/zip',
        sourceBytes: zipWith(600),
        sourceEntry: '/',
        sourceName: 'x.zip',
      }),
    ).rejects.toMatchObject({ code: 'ZIP_EXPANSION_LIMIT' })
  })

  test('what looks hostile is not sliced: it goes whole so the expander refuses it with the exact code', () => {
    const traversal = zipSync({
      '../fora.xml': strToU8('<a/>'),
      ...Object.fromEntries(
        Array.from({ length: 450 }, (_, index) => [`n${index}.xml`, strToU8(`<a>${index}</a>`)]),
      ),
    })
    const file = { bytes: traversal, name: 'hostil.zip' }
    expect(chunkOversizedZip(file)).toEqual([file])

    const corrupted = { bytes: new Uint8Array([1, 2, 3, 4, 5]), name: 'quebrado.zip' }
    expect(chunkOversizedZip(corrupted)).toEqual([corrupted])

    const huge = zipSync({ 'grande.xml': new Uint8Array(6 * 1024 * 1024).fill(65) })
    expect(chunkOversizedZip({ bytes: huge, name: 'grande.zip' })).toHaveLength(1)
  })
})
