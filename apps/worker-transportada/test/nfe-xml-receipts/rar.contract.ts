/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { unzipSync } from 'fflate'
import { describe, expect, test } from 'bun:test'

import { classifyReceivedFiles } from '../../src/nfe-xml-receipts/domain/received-xml-files.policy.js'
import { convertRarToZip } from '../../src/nfe-xml-receipts/domain/rar-to-zip.policy.js'
import { buildStoredRar } from '../fixtures/rar-archive.fixture.js'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('RAR no recebimento (spec 307)', () => {
  test('um .rar passa pela classificação', () => {
    const { accepted, skipped } = classifyReceivedFiles([
      { name: 'Notas.RAR', sizeBytes: 10 },
      { name: 'leia-me.txt', sizeBytes: 10 },
    ])
    expect(accepted.map((file) => file.name)).toEqual(['Notas.RAR'])
    expect(skipped).toHaveLength(1)
  })

  test('o rar vira um zip só com os XMLs, um por nota', async () => {
    const rar = buildStoredRar({
      'a.xml': bytes('<nfeProc>a</nfeProc>'),
      'sub/b.xml': bytes('<nfeProc>b</nfeProc>'),
      'leia-me.txt': bytes('x'),
    })
    const converted = await convertRarToZip({ bytes: rar, name: 'lote.rar' })
    expect(converted.name).toBe('lote.zip')
    const entries = unzipSync(converted.bytes)
    expect(Object.keys(entries).sort()).toEqual(['a.xml', 'sub/b.xml'])
    expect(new TextDecoder().decode(entries['a.xml'])).toBe('<nfeProc>a</nfeProc>')
  })

  test('arquivo que não é rar passa direto, sem mudar', async () => {
    const file = { bytes: bytes('<nfeProc/>'), name: 'a.xml' }
    expect(await convertRarToZip(file)).toBe(file)
  })

  test('rar corrompido, sem XML ou com caminho perigoso segue como item recusado, sem derrubar o lote', async () => {
    const corrupt = await convertRarToZip({ bytes: bytes('isto não é um rar'), name: 'x.rar' })
    expect(corrupt.name).toBe('x.rar.zip')
    expect(corrupt.bytes).toEqual(bytes('isto não é um rar'))

    const noXml = buildStoredRar({ 'leia-me.txt': bytes('x') })
    expect((await convertRarToZip({ bytes: noXml, name: 'x.rar' })).name).toBe('x.rar.zip')

    const traversal = buildStoredRar({ '../fora.xml': bytes('<nfeProc/>') })
    expect((await convertRarToZip({ bytes: traversal, name: 'x.rar' })).name).toBe('x.rar.zip')
  })
})
