/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'
import { zipSync } from 'fflate'

import { createNfeImportArchiveExpander } from '../src/nfe-imports/infrastructure/nfe-import-archive-expander.gateway.js'

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function xmlBytes(content: string): Uint8Array {
  return new TextEncoder().encode(content)
}

function incompressibleBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return bytes
}

describe('nfe import archive expander contract', () => {
  test('passes a raw XML source through unchanged with its sha256', async () => {
    const expander = createNfeImportArchiveExpander()
    const bytes = xmlBytes('<NFe id="raw"/>')

    const entries = await expander.expand({
      contentType: 'application/xml',
      sourceBytes: bytes,
      sourceEntry: 'nota.xml',
      sourceName: 'nota.xml',
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.entryName).toBe('nota.xml')
    expect(new TextDecoder().decode(entries[0]?.sourceBytes)).toBe('<NFe id="raw"/>')
    expect(entries[0]?.sourceSha256).toBe(sha256(bytes))
  })

  test('extracts a single XML entry from a ZIP archive', async () => {
    const expander = createNfeImportArchiveExpander()
    const bytes = xmlBytes('<NFe id="zipped"/>')
    const archive = zipSync({ 'nota.xml': bytes })

    const entries = await expander.expand({
      contentType: 'application/zip',
      sourceBytes: archive,
      sourceEntry: 'nota.xml',
      sourceName: 'lote.zip',
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.entryName).toBe('nota.xml')
    expect(new TextDecoder().decode(entries[0]?.sourceBytes)).toBe('<NFe id="zipped"/>')
    expect(entries[0]?.sourceSha256).toBe(sha256(bytes))
  })

  test('returns every XML entry sorted by name and ignores non-XML members', async () => {
    const expander = createNfeImportArchiveExpander()
    const first = xmlBytes('<NFe id="a"/>')
    const second = xmlBytes('<NFe id="b"/>')
    const archive = zipSync({
      'b.xml': second,
      'a.xml': first,
      'readme.txt': xmlBytes('not fiscal'),
    })

    const entries = await expander.expand({
      contentType: 'application/zip',
      sourceBytes: archive,
      sourceEntry: 'a.xml',
      sourceName: 'lote.zip',
    })

    expect(entries.map((entry) => entry.entryName)).toEqual(['a.xml', 'b.xml'])
    expect(new TextDecoder().decode(entries[0]?.sourceBytes)).toBe('<NFe id="a"/>')
    expect(new TextDecoder().decode(entries[1]?.sourceBytes)).toBe('<NFe id="b"/>')
  })

  test('rejects entries that escape the archive root (path traversal)', async () => {
    const expander = createNfeImportArchiveExpander()
    const archive = zipSync({ '../../etc/evil.xml': xmlBytes('<NFe/>') })

    await expect(
      expander.expand({
        contentType: 'application/zip',
        sourceBytes: archive,
        sourceEntry: 'evil.xml',
        sourceName: 'lote.zip',
      }),
    ).rejects.toThrow('ZIP_PATH_TRAVERSAL')
  })

  test('rejects an empty XML entry', async () => {
    const expander = createNfeImportArchiveExpander()
    const archive = zipSync({ 'empty.xml': new Uint8Array(0) })

    await expect(
      expander.expand({
        contentType: 'application/zip',
        sourceBytes: archive,
        sourceEntry: 'empty.xml',
        sourceName: 'lote.zip',
      }),
    ).rejects.toThrow('ZIP_EMPTY_ENTRY')
  })

  test('rejects an archive with no XML entries', async () => {
    const expander = createNfeImportArchiveExpander()
    const archive = zipSync({ 'readme.txt': xmlBytes('not fiscal') })

    await expect(
      expander.expand({
        contentType: 'application/zip',
        sourceBytes: archive,
        sourceEntry: 'readme.txt',
        sourceName: 'lote.zip',
      }),
    ).rejects.toThrow('ZIP_NO_XML_ENTRIES')
  })

  test('rejects a highly compressible entry above the ratio limit (zip bomb)', async () => {
    const expander = createNfeImportArchiveExpander()
    const bomb = xmlBytes('A'.repeat(200_000))
    const archive = zipSync({ 'bomb.xml': bomb })

    await expect(
      expander.expand({
        contentType: 'application/zip',
        sourceBytes: archive,
        sourceEntry: 'bomb.xml',
        sourceName: 'lote.zip',
      }),
    ).rejects.toThrow('ZIP_EXPANSION_LIMIT')
  })

  test('rejects when the entry count exceeds the configured limit', async () => {
    const expander = createNfeImportArchiveExpander({ limits: { maxEntries: 1 } })
    const archive = zipSync({
      'a.xml': incompressibleBytes(64),
      'b.xml': incompressibleBytes(64),
    })

    await expect(
      expander.expand({
        contentType: 'application/zip',
        sourceBytes: archive,
        sourceEntry: 'a.xml',
        sourceName: 'lote.zip',
      }),
    ).rejects.toThrow('ZIP_EXPANSION_LIMIT')
  })

  test('rejects a single entry larger than the per-entry byte limit', async () => {
    const expander = createNfeImportArchiveExpander({ limits: { maxEntryBytes: 16 } })
    const archive = zipSync({ 'big.xml': incompressibleBytes(256) })

    await expect(
      expander.expand({
        contentType: 'application/zip',
        sourceBytes: archive,
        sourceEntry: 'big.xml',
        sourceName: 'lote.zip',
      }),
    ).rejects.toThrow('ZIP_ENTRY_TOO_LARGE')
  })
})
