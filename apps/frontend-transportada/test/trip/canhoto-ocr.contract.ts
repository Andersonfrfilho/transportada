/**
 * Spec 156 T14, ADR-0069 §3: extração do número/série do canhoto a partir do texto OCR (sem
 * whitelist — texto inteiro, aproveita só o token depois do rótulo) e o casamento com as notas da
 * viagem (R4 — unicidade sobre todas as notas não liberadas; fora da seleção cai no manual).
 */
import { describe, expect, test } from 'bun:test'

import {
  CANHOTO_OCR_MINIMUM_WORD_CONFIDENCE,
  extractCanhotoNumberFromWords,
  identifyCanhotoNumber,
  matchCanhotoOcrExtraction,
  type CanhotoOcrTripDocument,
  type CanhotoOcrWord,
} from '@/modules/trip/shared/canhotoOcr.service'

/** Mesma leitura da sonda da ADR-0069: `NF-e N° 000.123.456 SERIE 1`, confiança 91. */
const CLEAN_WORDS: readonly CanhotoOcrWord[] = [
  { confidence: 91, text: 'NF-e' },
  { confidence: 91, text: 'N°' },
  { confidence: 91, text: '000.123.456' },
  { confidence: 91, text: 'SERIE' },
  { confidence: 91, text: '1' },
]

describe('extractCanhotoNumberFromWords (ADR-0069 §3, R2)', () => {
  test('lê número e série do texto inteiro, sem whitelist', () => {
    expect(extractCanhotoNumberFromWords(CLEAN_WORDS)).toEqual({ number: '000123456', series: '1' })
  })

  test('aceita as variações de rótulo do número (Nº, N°, NO, NUMERO)', () => {
    for (const label of ['Nº', 'N°', 'NO', 'NUMERO']) {
      const words: readonly CanhotoOcrWord[] = [
        { confidence: 95, text: label },
        { confidence: 95, text: '000.004.321' },
      ]
      expect(extractCanhotoNumberFromWords(words)).toEqual({ number: '000004321', series: null })
    }
  })

  test('sem rótulo, leitura inconclusiva', () => {
    expect(extractCanhotoNumberFromWords([{ confidence: 95, text: '000.123.456' }])).toBeUndefined()
  })

  test('token fora do formato \\d{3}.\\d{3}.\\d{3} não se "conserta"', () => {
    const words: readonly CanhotoOcrWord[] = [
      { confidence: 95, text: 'Nº' },
      { confidence: 95, text: '000.123.45' },
    ]
    expect(extractCanhotoNumberFromWords(words)).toBeUndefined()
  })

  test('dígito trocado, confiança baixa → inconclusivo (nunca "conserta")', () => {
    const words: readonly CanhotoOcrWord[] = [
      { confidence: 95, text: 'Nº' },
      { confidence: CANHOTO_OCR_MINIMUM_WORD_CONFIDENCE - 1, text: '000.123.457' },
    ]
    expect(extractCanhotoNumberFromWords(words)).toBeUndefined()
  })

  test('confiança exatamente no limiar ainda vale', () => {
    const words: readonly CanhotoOcrWord[] = [
      { confidence: 95, text: 'Nº' },
      { confidence: CANHOTO_OCR_MINIMUM_WORD_CONFIDENCE, text: '000.123.456' },
    ]
    expect(extractCanhotoNumberFromWords(words)).toEqual({ number: '000123456', series: null })
  })

  test('série com confiança baixa é descartada, mas o número continua valendo', () => {
    const words: readonly CanhotoOcrWord[] = [
      { confidence: 95, text: 'Nº' },
      { confidence: 95, text: '000.123.456' },
      { confidence: 95, text: 'SERIE' },
      { confidence: 10, text: '1' },
    ]
    expect(extractCanhotoNumberFromWords(words)).toEqual({ number: '000123456', series: null })
  })

  test('Baixos: "no" minúsculo (preposição comum) não casa como rótulo do número', () => {
    const words: readonly CanhotoOcrWord[] = [
      { confidence: 95, text: 'entregue' },
      { confidence: 95, text: 'no' },
      { confidence: 95, text: '000.123.456' },
    ]
    expect(extractCanhotoNumberFromWords(words)).toBeUndefined()
  })

  test('Baixos: "NO" maiúsculo (variação de OCR de "Nº") continua casando', () => {
    const words: readonly CanhotoOcrWord[] = [
      { confidence: 95, text: 'NO' },
      { confidence: 95, text: '000.123.456' },
    ]
    expect(extractCanhotoNumberFromWords(words)).toEqual({ number: '000123456', series: null })
  })

  test('Baixos: considera todas as ocorrências do rótulo, não só a primeira', () => {
    const words: readonly CanhotoOcrWord[] = [
      { confidence: 95, text: 'Nº' },
      { confidence: 95, text: 'cliente' },
      { confidence: 95, text: 'Nº' },
      { confidence: 95, text: '000.123.456' },
    ]
    expect(extractCanhotoNumberFromWords(words)).toEqual({ number: '000123456', series: null })
  })
})

const DOC_455: CanhotoOcrTripDocument = {
  id: 'doc-455',
  nfeNumber: '455',
  nfeSeries: '1',
  releasedAt: null,
}
const DOC_456: CanhotoOcrTripDocument = {
  id: 'doc-456',
  nfeNumber: '456',
  nfeSeries: '1',
  releasedAt: null,
}
const DOC_457: CanhotoOcrTripDocument = {
  id: 'doc-457',
  nfeNumber: '457',
  nfeSeries: '1',
  releasedAt: null,
}

describe('matchCanhotoOcrExtraction (ADR-0069 §3, R4 — viagem de notas consecutivas)', () => {
  test('cada número consecutivo casa só com a nota dele, mesmo com vizinhas na viagem', () => {
    const tripDocuments = [DOC_455, DOC_456, DOC_457]
    for (const document of tripDocuments) {
      expect(
        matchCanhotoOcrExtraction({
          expectedDocumentId: document.id,
          extraction: { number: document.nfeNumber ?? '', series: document.nfeSeries },
          selectedDocumentIds: tripDocuments.map((candidate) => candidate.id),
          tripDocuments,
        }),
      ).toEqual({ documentId: document.id, status: 'matched' })
    }
  })

  test('zero candidata → manual', () => {
    expect(
      matchCanhotoOcrExtraction({
        expectedDocumentId: DOC_455.id,
        extraction: { number: '999', series: '1' },
        selectedDocumentIds: [DOC_455.id],
        tripDocuments: [DOC_455],
      }),
    ).toEqual({ status: 'manual' })
  })

  test('mais de uma candidata (mesmo número/série em duas notas) → manual', () => {
    const duplicate: CanhotoOcrTripDocument = { ...DOC_456, id: 'doc-456-duplicate' }
    expect(
      matchCanhotoOcrExtraction({
        expectedDocumentId: DOC_456.id,
        extraction: { number: '456', series: '1' },
        selectedDocumentIds: [DOC_456.id, duplicate.id],
        tripDocuments: [DOC_456, duplicate],
      }),
    ).toEqual({ status: 'manual' })
  })

  test('nota liberada não conta na unicidade (R4)', () => {
    const released: CanhotoOcrTripDocument = {
      ...DOC_456,
      id: 'doc-456-released',
      releasedAt: '2026-09-18T00:00:00.000Z',
    }
    expect(
      matchCanhotoOcrExtraction({
        expectedDocumentId: DOC_456.id,
        extraction: { number: '456', series: '1' },
        selectedDocumentIds: [DOC_456.id],
        tripDocuments: [DOC_456, released],
      }),
    ).toEqual({ documentId: DOC_456.id, status: 'matched' })
  })

  test('casa com nota da viagem fora da seleção → manual, sem bloqueio (R4)', () => {
    expect(
      matchCanhotoOcrExtraction({
        expectedDocumentId: DOC_455.id,
        extraction: { number: '456', series: '1' },
        selectedDocumentIds: [DOC_455.id],
        tripDocuments: [DOC_455, DOC_456],
      }),
    ).toEqual({ status: 'manual' })
  })

  test('casa com outra nota da seleção → oferece trocar (otherSelected)', () => {
    expect(
      matchCanhotoOcrExtraction({
        expectedDocumentId: DOC_455.id,
        extraction: { number: '456', series: '1' },
        selectedDocumentIds: [DOC_455.id, DOC_456.id],
        tripDocuments: [DOC_455, DOC_456],
      }),
    ).toEqual({ documentId: DOC_456.id, status: 'otherSelected' })
  })

  test('zeros à esquerda não contam na comparação', () => {
    expect(
      matchCanhotoOcrExtraction({
        expectedDocumentId: DOC_456.id,
        extraction: { number: '000000456', series: '001' },
        selectedDocumentIds: [DOC_456.id],
        tripDocuments: [DOC_456],
      }),
    ).toEqual({ documentId: DOC_456.id, status: 'matched' })
  })
})

describe('identifyCanhotoNumber (extração + casamento numa chamada)', () => {
  test('leitura limpa e única vira sugestão com o número lido', () => {
    const result = identifyCanhotoNumber({
      expectedDocumentId: 'doc-123456',
      selectedDocumentIds: ['doc-123456'],
      tripDocuments: [{ id: 'doc-123456', nfeNumber: '123456', nfeSeries: '1', releasedAt: null }],
      words: CLEAN_WORDS,
    })
    expect(result).toEqual({
      documentId: 'doc-123456',
      extraction: { number: '000123456', series: '1' },
      status: 'matched',
    })
  })

  test('erro de leitura (sem rótulo) → manual', () => {
    expect(
      identifyCanhotoNumber({
        expectedDocumentId: 'doc-1',
        selectedDocumentIds: ['doc-1'],
        tripDocuments: [{ id: 'doc-1', nfeNumber: '1', nfeSeries: '1', releasedAt: null }],
        words: [{ confidence: 95, text: 'texto qualquer' }],
      }),
    ).toEqual({ status: 'manual' })
  })
})

describe('sintaxe de regex aceita pelo build da CI', () => {
  test('nenhum módulo usa modificador embutido (?i:…), que o Rollup/Workbox da CI recusa', async () => {
    const sources = new Bun.Glob('src/**/*.{ts,tsx}')
    const offenders: string[] = []
    for await (const path of sources.scan({ cwd: import.meta.dir + '/../..' })) {
      const text = await Bun.file(`${import.meta.dir}/../../${path}`).text()
      if (/\(\?[imsx-]+:/u.test(text.replace(/\/\*[\s\S]*?\*\//gu, ''))) offenders.push(path)
    }
    expect(offenders).toEqual([])
  })
})
