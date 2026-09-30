/**
 * Spec 220 RF26/RNF02: a matriz de veredito do canhoto. Código de barras que casa com a nota
 * esperada aprova sozinho; **OCR nunca aprova** — sugere, e alguém decide. Todo o resto, inclusive
 * o prazo estourado, fica `pending`.
 *
 * As duas invariantes do fim deste arquivo são as CHECK do banco escritas de novo aqui
 * (`trip_delivery_proofs_canhoto_read_number_check` e `..._auto_approval_check`): se o painel
 * puder montar um veredito que o Postgres recusa, a descoberta é um 500 em produção, não um teste.
 */
import { describe, expect, test } from 'bun:test'

import type { CanhotoIdentificationResult } from '@/modules/trip/shared/canhotoIdentification.service'
import type {
  CanhotoOcrTripDocument,
  CanhotoOcrWord,
} from '@/modules/trip/shared/canhotoOcr.service'
import {
  CANHOTO_REVIEW_TIMED_OUT,
  CANHOTO_REVIEW_TIMEOUT_MS,
  resolveCanhotoReviewOutcome,
  reviewCanhoto,
  type CanhotoReviewOutcome,
  type CanhotoReviewTripDocument,
} from '@/modules/trip/shared/canhotoReview.service'

import {
  buildAccessKeyBarcodeFrame,
  buildBlankBarcodeFrame,
} from '../fixtures/canhotoBarcodeFrame.fixture.js'

const EXPECTED_DOCUMENT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_DOCUMENT_ID = '22222222-2222-4222-8222-222222222222'
const KEYLESS_DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'

const TRIP_DOCUMENTS: readonly CanhotoOcrTripDocument[] = [
  { id: EXPECTED_DOCUMENT_ID, nfeNumber: '000123456', nfeSeries: '1', releasedAt: null },
  { id: OTHER_DOCUMENT_ID, nfeNumber: '000654321', nfeSeries: '2', releasedAt: null },
  { id: KEYLESS_DOCUMENT_ID, nfeNumber: null, nfeSeries: null, releasedAt: null },
]

const PENDING_WITHOUT_READING: CanhotoReviewOutcome = {
  readDocumentId: null,
  readNumber: null,
  readSeries: null,
  readSource: null,
  review: 'pending',
}

function resolve(
  identification: CanhotoIdentificationResult,
  ocr?: Parameters<typeof resolveCanhotoReviewOutcome>[0]['ocr'],
): CanhotoReviewOutcome {
  return resolveCanhotoReviewOutcome({
    identification,
    ...(ocr === undefined ? {} : { ocr }),
    tripDocuments: TRIP_DOCUMENTS,
  })
}

describe('o código de barras é o único que aprova sozinho (RF26)', () => {
  test('`matched` aprova, com a leitura gravada e origem `barcode`', () => {
    expect(resolve({ documentId: EXPECTED_DOCUMENT_ID, status: 'matched' })).toEqual({
      readDocumentId: EXPECTED_DOCUMENT_ID,
      readNumber: '000123456',
      readSeries: '1',
      readSource: 'barcode',
      review: 'approved',
    })
  })

  test('nota casada pela chave mas sem número impresso não aprova: não há o que gravar', () => {
    expect(resolve({ documentId: KEYLESS_DOCUMENT_ID, status: 'matched' })).toEqual(
      PENDING_WITHOUT_READING,
    )
  })

  test('canhoto de outra nota da seleção fica pendente, com a nota que ele aponta', () => {
    expect(resolve({ documentId: OTHER_DOCUMENT_ID, status: 'otherSelected' })).toEqual({
      readDocumentId: OTHER_DOCUMENT_ID,
      readNumber: '000654321',
      readSeries: '2',
      readSource: 'barcode',
      review: 'pending',
    })
  })

  test('nota da viagem fora da seleção também fica pendente, com a leitura', () => {
    expect(resolve({ documentId: OTHER_DOCUMENT_ID, status: 'onTripNotSelected' })).toEqual({
      readDocumentId: OTHER_DOCUMENT_ID,
      readNumber: '000654321',
      readSeries: '2',
      readSource: 'barcode',
      review: 'pending',
    })
  })

  test('chave que não é de nenhuma nota da viagem não vira leitura — não há nota a apontar', () => {
    expect(resolve({ documentLabel: '000999999/9', status: 'notOnTrip' })).toEqual(
      PENDING_WITHOUT_READING,
    )
  })
})

describe('o OCR sugere e nunca aprova (RF26)', () => {
  test('número certo vira sugestão pendente, com origem `ocr`', () => {
    expect(
      resolve(
        { status: 'unreadable' },
        {
          documentId: EXPECTED_DOCUMENT_ID,
          extraction: { number: '000123456', series: '1' },
          status: 'matched',
        },
      ),
    ).toEqual({
      readDocumentId: EXPECTED_DOCUMENT_ID,
      readNumber: '000123456',
      readSeries: '1',
      readSource: 'ocr',
      review: 'pending',
    })
  })

  test('número sem série é sugestão válida — a série é opcional na leitura', () => {
    expect(
      resolve(
        { status: 'unreadable' },
        {
          documentId: OTHER_DOCUMENT_ID,
          extraction: { number: '000654321', series: null },
          status: 'otherSelected',
        },
      ),
    ).toEqual({
      readDocumentId: OTHER_DOCUMENT_ID,
      readNumber: '000654321',
      readSeries: null,
      readSource: 'ocr',
      review: 'pending',
    })
  })

  test('leitura inconclusiva não grava nada', () => {
    expect(resolve({ status: 'unreadable' }, { status: 'manual' })).toEqual(PENDING_WITHOUT_READING)
  })

  test('ilegível com OCR desligado fica pendente direto, sem leitura', () => {
    expect(resolve({ status: 'unreadable' })).toEqual(PENDING_WITHOUT_READING)
  })
})

describe('o prazo estourado é um veredito, não um erro (RNF02)', () => {
  test('o teto é o da ADR-0078: 20 s', () => {
    expect(CANHOTO_REVIEW_TIMEOUT_MS).toBe(20_000)
  })

  test('estourou, fica pendente e sem leitura', () => {
    expect(resolve({ status: 'unreadable' }, CANHOTO_REVIEW_TIMED_OUT)).toEqual(
      PENDING_WITHOUT_READING,
    )
  })

  test('o código de barras já decidido sobrevive ao prazo do OCR', () => {
    expect(
      resolve({ documentId: EXPECTED_DOCUMENT_ID, status: 'matched' }, CANHOTO_REVIEW_TIMED_OUT)
        .review,
    ).toBe('approved')
  })
})

describe('as CHECK do banco valem também no painel', () => {
  const EVERY_OUTCOME: readonly CanhotoReviewOutcome[] = [
    resolve({ documentId: EXPECTED_DOCUMENT_ID, status: 'matched' }),
    resolve({ documentId: KEYLESS_DOCUMENT_ID, status: 'matched' }),
    resolve({ documentId: OTHER_DOCUMENT_ID, status: 'otherSelected' }),
    resolve({ documentId: OTHER_DOCUMENT_ID, status: 'onTripNotSelected' }),
    resolve({ documentLabel: '000999999/9', status: 'notOnTrip' }),
    resolve({ status: 'unreadable' }),
    resolve({ status: 'unreadable' }, { status: 'manual' }),
    resolve({ status: 'unreadable' }, CANHOTO_REVIEW_TIMED_OUT),
    resolve(
      { status: 'unreadable' },
      {
        documentId: EXPECTED_DOCUMENT_ID,
        extraction: { number: '000123456', series: '1' },
        status: 'matched',
      },
    ),
  ]

  test('número lido e origem da leitura andam juntos (`..._read_number_check`)', () => {
    for (const outcome of EVERY_OUTCOME) {
      expect(outcome.readNumber === null).toBe(outcome.readSource === null)
    }
  })

  test('série só existe com número (`..._read_series_check`)', () => {
    for (const outcome of EVERY_OUTCOME) {
      if (outcome.readSeries !== null) expect(outcome.readNumber).not.toBeNull()
    }
  })

  test('aprovação automática só com código de barras (`..._auto_approval_check`)', () => {
    for (const outcome of EVERY_OUTCOME) {
      if (outcome.review === 'approved') expect(outcome.readSource).toBe('barcode')
    }
  })

  test('nenhum veredito automático é `rejected` — recusar é decisão de gente (RF28)', () => {
    for (const outcome of EVERY_OUTCOME) {
      expect(['approved', 'pending']).toContain(outcome.review)
    }
  })
})

const BARCODE_KEY = '35240912345678000199550010000123451876543212'

const BARCODE_DOCUMENTS: readonly CanhotoReviewTripDocument[] = [
  {
    accessKey: BARCODE_KEY,
    id: EXPECTED_DOCUMENT_ID,
    nfeNumber: '000012345',
    nfeSeries: '1',
    releasedAt: null,
  },
]

/** A mesma leitura da sonda da ADR-0069, que casa com a nota esperada de `TRIP_DOCUMENTS`. */
const CLEAN_WORDS: readonly CanhotoOcrWord[] = [
  { confidence: 91, text: 'NF-e' },
  { confidence: 91, text: 'N°' },
  { confidence: 91, text: '000.123.456' },
  { confidence: 91, text: 'SERIE' },
  { confidence: 91, text: '1' },
]

/** O reconhecedor entra injetado em todos os casos abaixo — a imagem nunca chega a ser lida. */
const BLANK_IMAGE = Buffer.alloc(4)

describe('a orquestração lê o código de barras primeiro (RNF02)', () => {
  test('quadro legível aprova sem acordar o OCR', async () => {
    let recognizeCalls = 0
    const outcome = await reviewCanhoto({
      canhotoOcrEnabled: true,
      expectedDocumentId: EXPECTED_DOCUMENT_ID,
      frame: buildAccessKeyBarcodeFrame(BARCODE_KEY),
      image: BLANK_IMAGE,
      recognizeWords: () => {
        recognizeCalls += 1
        return Promise.resolve(CLEAN_WORDS)
      },
      selectedDocumentIds: [EXPECTED_DOCUMENT_ID],
      tripDocuments: BARCODE_DOCUMENTS,
    })

    expect(outcome.review).toBe('approved')
    expect(outcome.readSource).toBe('barcode')
    expect(recognizeCalls).toBe(0)
  })

  test('com o OCR desligado, quadro ilegível fica pendente e não chama o reconhecedor', async () => {
    let recognizeCalls = 0
    const outcome = await reviewCanhoto({
      canhotoOcrEnabled: false,
      expectedDocumentId: EXPECTED_DOCUMENT_ID,
      frame: buildBlankBarcodeFrame(),
      image: BLANK_IMAGE,
      recognizeWords: () => {
        recognizeCalls += 1
        return Promise.resolve(CLEAN_WORDS)
      },
      selectedDocumentIds: [EXPECTED_DOCUMENT_ID],
      tripDocuments: TRIP_DOCUMENTS,
    })

    expect(outcome).toEqual(PENDING_WITHOUT_READING)
    expect(recognizeCalls).toBe(0)
  })

  test('com o OCR ligado, o quadro ilegível vira sugestão — e continua pendente', async () => {
    expect(
      await reviewCanhoto({
        canhotoOcrEnabled: true,
        expectedDocumentId: EXPECTED_DOCUMENT_ID,
        frame: buildBlankBarcodeFrame(),
        image: BLANK_IMAGE,
        recognizeWords: () => Promise.resolve(CLEAN_WORDS),
        selectedDocumentIds: [EXPECTED_DOCUMENT_ID],
        tripDocuments: TRIP_DOCUMENTS,
      }),
    ).toEqual({
      readDocumentId: EXPECTED_DOCUMENT_ID,
      readNumber: '000123456',
      readSeries: '1',
      readSource: 'ocr',
      review: 'pending',
    })
  })

  test('reconhecedor que não devolve nada não inventa leitura', async () => {
    expect(
      await reviewCanhoto({
        canhotoOcrEnabled: true,
        expectedDocumentId: EXPECTED_DOCUMENT_ID,
        frame: buildBlankBarcodeFrame(),
        image: BLANK_IMAGE,
        recognizeWords: () => Promise.resolve(undefined),
        selectedDocumentIds: [EXPECTED_DOCUMENT_ID],
        tripDocuments: TRIP_DOCUMENTS,
      }),
    ).toEqual(PENDING_WITHOUT_READING)
  })
})
