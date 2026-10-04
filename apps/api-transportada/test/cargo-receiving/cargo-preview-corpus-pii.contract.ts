/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: o corpus não carrega dado pessoal. Bairro não entra na conferência: os de verdade
 * são genéricos (`CENTRO`) e o corpus nem tem a coluna. A forma é conferida sempre; a comparação com
 * os nomes, CNPJs, CEPs e endereços REAIS só roda onde as planilhas e os XMLs originais existem
 * (`CARGO_PREVIEW_PII_WORKBOOK_DIR` e `CARGO_PREVIEW_PII_NFE_DIR`) — no CI eles não existem.
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { XMLParser } from 'fast-xml-parser'

import { parseCargoPreviewWorkbook } from '../../src/cargo-receiving/domain/cargo-preview-workbook.parser.js'
import { normalizePlaceName } from '../../src/cargo-receiving/domain/cargo-preview-value.policy.js'
import {
  CORPUS_DIRECTORY,
  CORPUS_SHEETS,
  loadCorpusDocuments,
  loadCorpusItems,
} from '../fixtures/cargo-preview-corpus.fixture.js'
import { FR_COLUMN_MAP } from '../fixtures/cargo-preview-workbook.fixture.js'

const WORKBOOK_DIR = process.env['CARGO_PREVIEW_PII_WORKBOOK_DIR']
const NFE_DIR = process.env['CARGO_PREVIEW_PII_NFE_DIR']
const MIN_NAME_LENGTH = 6
const NEW_FILES = [
  'src/cargo-receiving/domain',
  'test/cargo-receiving',
  'test/fixtures/cargo-preview-corpus',
  'test/fixtures/cargo-preview-corpus.fixture.ts',
  'test/fixtures/cargo-preview-matching.fixture.ts',
  'test/fixtures/cargo-preview-workbook.fixture.ts',
]

type RealData = { codes: Set<string>; digits: Set<string>; texts: Set<string> }

const documents = await loadCorpusDocuments()
const items = (await Promise.all(CORPUS_SHEETS.map((sheet) => loadCorpusItems(sheet.file)))).flat()

function textKey(text: unknown): string {
  return normalizePlaceName(String(text ?? ''))
    .replace(/[^A-Z0-9]+/gu, ' ')
    .trim()
}

async function collectWorkbooks(directory: string, real: RealData): Promise<void> {
  for (const file of (await readdir(directory)).filter((name) => /^FR-.*\.xlsm$/u.test(name))) {
    const bytes = new Uint8Array(await Bun.file(join(directory, file)).arrayBuffer())
    const { rows } = parseCargoPreviewWorkbook({
      bytes,
      clock: () => performance.now(),
      columnMap: FR_COLUMN_MAP,
      sheetName: null,
    })
    for (const row of rows) {
      for (const text of [row.recipientName, row.address]) real.texts.add(textKey(text))
      if (row.postalCode !== undefined) real.digits.add(row.postalCode)
      for (const code of [row.recipientCode, row.contractorReference])
        if (code !== undefined) real.codes.add(code)
    }
  }
}

function at(node: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null) return undefined
    return (current as Readonly<Record<string, unknown>>)[key]
  }, node)
}

async function collectInvoices(directory: string, real: RealData): Promise<void> {
  const parser = new XMLParser({ parseTagValue: false, removeNSPrefix: true })
  for (const file of (await readdir(directory)).filter((name) => name.endsWith('.xml'))) {
    const invoice = at(
      parser.parse(await Bun.file(join(directory, file)).text()),
      'nfeProc.NFe.infNFe',
    )
    for (const path of ['dest.xNome', 'dest.enderDest.xLgr', 'emit.xNome'])
      real.texts.add(textKey(at(invoice, path)))
    for (const path of ['dest.CNPJ', 'dest.CPF', 'dest.enderDest.CEP', 'emit.CNPJ']) {
      const digits = at(invoice, path)
      if (typeof digits === 'string') real.digits.add(digits)
    }
    const number = at(invoice, 'ide.nNF')
    if (typeof number === 'string') real.codes.add(number)
  }
}

async function readNewFiles(): Promise<string> {
  const root = new URL('../../', import.meta.url).pathname
  const texts: string[] = []
  for (const entry of NEW_FILES) {
    const path = join(root, entry)
    const names = entry.includes('.')
      ? [path]
      : (await readdir(path))
          .filter((name) => /cargo-preview|\.json$/u.test(name))
          .map((name) => join(path, name))
    for (const name of names) texts.push(await Bun.file(name).text())
  }
  return texts.join('\n')
}

describe('o corpus da prévia não tem dado pessoal (spec 237 T4.3)', () => {
  test('forma anonimizada: nome, CEP, CNPJ, código, pedido e número são falsos', () => {
    expect(String(CORPUS_DIRECTORY)).toContain('cargo-preview-corpus')
    for (const item of items) {
      expect(item.recipientName ?? 'Destinatário 000').toMatch(/^Destinatário \d{3}$/u)
      expect(item.postalCode ?? '00000000').toMatch(/^00\d{6}$/u)
      expect(item.recipientCode ?? '10000').toMatch(/^10\d{3}$/u)
      expect(item.contractorReference ?? '500000').toMatch(/^50\d{4}$/u)
    }
    for (const document of documents) {
      expect(document.recipientName ?? 'Destinatário 000').toMatch(/^Destinatário \d{3}$/u)
      expect(document.recipientPostalCode ?? '00000000').toMatch(/^00\d{6}$/u)
      expect(document.recipientTaxId ?? '99000000000000').toMatch(/^990000\d{8}$/u)
      expect(document.number).toMatch(/^1\d{5}$/u)
    }
  })

  const describeReal =
    WORKBOOK_DIR === undefined || NFE_DIR === undefined ? describe.skip : describe
  describeReal(
    'contra os arquivos reais (só onde eles existem; no CI, pulado de propósito)',
    () => {
      test('nenhuma razão social, endereço, CNPJ, CEP, código ou número real nos arquivos novos', async () => {
        const real: RealData = { codes: new Set(), digits: new Set(), texts: new Set() }
        await collectWorkbooks(WORKBOOK_DIR ?? '', real)
        await collectInvoices(NFE_DIR ?? '', real)
        expect(real.digits.size).toBeGreaterThan(400)
        const text = await readNewFiles()
        const normalized = textKey(text)
        const leakedTexts = [...real.texts].filter(
          (name) => name.length >= MIN_NAME_LENGTH && normalized.includes(name),
        )
        const leakedDigits = [...real.digits].filter((digits) =>
          new RegExp(`(?<!\\d)${digits}(?!\\d)`, 'u').test(text),
        )
        const corpusCodes = [
          ...items.flatMap((item) => [item.recipientCode, item.contractorReference]),
          ...documents.map((document) => document.number),
        ]
        const leakedCodes = corpusCodes.filter((code) => code !== undefined && real.codes.has(code))
        expect({
          leakedCodes: leakedCodes.length,
          leakedDigits: leakedDigits.length,
          leakedTexts: leakedTexts.length,
        }).toEqual({ leakedCodes: 0, leakedDigits: 0, leakedTexts: 0 })
      })
    },
  )
})
