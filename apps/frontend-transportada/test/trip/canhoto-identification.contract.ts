/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  classifyCanhotoDocument,
  identifyCanhotoFromFrame,
  parseNfeAccessKeyFromBarcode,
  type CanhotoTripDocument,
} from '@/modules/trip/shared/canhotoIdentification.service'

import {
  buildAccessKeyBarcodeFrame,
  buildBlankBarcodeFrame,
} from '../fixtures/canhotoBarcodeFrame.fixture'

/** Mesmas chaves usadas no fixture de imagem — geradas com CNPJ, UF e DV válidos (mód. 11). */
const REQUESTED_KEY = '35240912345678000199550010000123451876543212'
const OTHER_SELECTED_KEY = '35240912345678000199550010000123461876543228'
const NOT_ON_TRIP_KEY = '35240912345678000199550010000999991111122222'
const ON_TRIP_NOT_SELECTED_KEY = '35240912345678000199550010000123471222233332'
const MODEL_65_KEY = '35240912345678000199650010000123451876543215'
const BAD_CHECK_DIGIT_KEY = '35240912345678000199550010000123451876543213'
/** NT 2024.002 (IN RFB 2229/2024): CNPJ do emitente alfanumérico a partir de 01/07/2026. */
const ALPHANUMERIC_CNPJ_KEY = '35240912ABC456780001550010000123451876543211'

const REQUESTED_DOCUMENT: CanhotoTripDocument = {
  id: 'doc-requested',
  nfeNumber: '12345',
  nfeSeries: '1',
}
const OTHER_SELECTED_DOCUMENT: CanhotoTripDocument = {
  id: 'doc-other-selected',
  nfeNumber: '12346',
  nfeSeries: '1',
}
const ON_TRIP_NOT_SELECTED_DOCUMENT: CanhotoTripDocument = {
  id: 'doc-on-trip-not-selected',
  nfeNumber: '12347',
  nfeSeries: '1',
}

const TRIP_DOCUMENTS: readonly CanhotoTripDocument[] = [
  REQUESTED_DOCUMENT,
  OTHER_SELECTED_DOCUMENT,
  ON_TRIP_NOT_SELECTED_DOCUMENT,
]
const SELECTED_DOCUMENT_IDS = [REQUESTED_DOCUMENT.id, OTHER_SELECTED_DOCUMENT.id]

function classify(text: string | null): ReturnType<typeof classifyCanhotoDocument> {
  return classifyCanhotoDocument({
    expectedDocumentId: REQUESTED_DOCUMENT.id,
    selectedDocumentIds: SELECTED_DOCUMENT_IDS,
    text,
    tripDocuments: TRIP_DOCUMENTS,
  })
}

describe('canhoto identification contract (spec 156 T10, ADR-0067 §4)', () => {
  describe('classificação por texto — sem imagem nenhuma', () => {
    test('a chave da nota pedida é matched', () => {
      expect(classify(REQUESTED_KEY)).toEqual({
        documentId: REQUESTED_DOCUMENT.id,
        status: 'matched',
      })
    })

    test('a chave de outra nota da seleção oferece trocar (otherSelected)', () => {
      expect(classify(OTHER_SELECTED_KEY)).toEqual({
        documentId: OTHER_SELECTED_DOCUMENT.id,
        status: 'otherSelected',
      })
    })

    test('a chave de nota fora da viagem bloqueia com número/série extraídos (notOnTrip)', () => {
      expect(classify(NOT_ON_TRIP_KEY)).toEqual({ documentLabel: '99999/1', status: 'notOnTrip' })
    })

    /**
     * Decisão registrada (não é pendência): nota da viagem fora do lote marcado é bloqueada, nunca
     * incluída sozinha na seleção — só `otherSelected` troca dentro do que já está marcado.
     */
    test('a chave de nota da viagem fora da seleção bloqueia (onTripNotSelected)', () => {
      expect(classify(ON_TRIP_NOT_SELECTED_KEY)).toEqual({
        documentId: ON_TRIP_NOT_SELECTED_DOCUMENT.id,
        status: 'onTripNotSelected',
      })
    })

    test('dígito verificador errado é unreadable', () => {
      expect(classify(BAD_CHECK_DIGIT_KEY)).toEqual({ status: 'unreadable' })
    })

    test('modelo 65 (NFC-e) é unreadable — só modelo 55 é chave de NF-e válida aqui', () => {
      expect(classify(MODEL_65_KEY)).toEqual({ status: 'unreadable' })
    })

    test('lixo sem formato de chave é unreadable', () => {
      expect(classify('ISBN 978-3-16-148410-0')).toEqual({ status: 'unreadable' })
    })

    test('ausência de código (canhoto destacado, sem código de barras) é unreadable', () => {
      expect(classify(null)).toEqual({ status: 'unreadable' })
    })

    test('parseNfeAccessKeyFromBarcode extrai número e série sem zeros à esquerda', () => {
      expect(parseNfeAccessKeyFromBarcode(REQUESTED_KEY)).toEqual({ number: '12345', series: '1' })
    })

    test('Baixos: CNPJ alfanumérico na chave (NT 2024.002) ainda é matched', () => {
      expect(parseNfeAccessKeyFromBarcode(ALPHANUMERIC_CNPJ_KEY)).toEqual({
        number: '12345',
        series: '1',
      })
      expect(classify(ALPHANUMERIC_CNPJ_KEY)).toEqual({
        documentId: REQUESTED_DOCUMENT.id,
        status: 'matched',
      })
    })

    test('M13c: sem a chave carregada, número/série não decide sozinho — cai no manual', () => {
      const result = classifyCanhotoDocument({
        accessKeyDataAvailable: false,
        expectedDocumentId: REQUESTED_DOCUMENT.id,
        selectedDocumentIds: SELECTED_DOCUMENT_IDS,
        text: REQUESTED_KEY,
        tripDocuments: TRIP_DOCUMENTS,
      })
      expect(result).toEqual({ status: 'unreadable' })
    })

    test('M13c: chave inteira decide mesmo sem accessKeyDataAvailable — exata sempre vale', () => {
      const documentsWithKey: readonly CanhotoTripDocument[] = [
        { ...REQUESTED_DOCUMENT, accessKey: REQUESTED_KEY },
        OTHER_SELECTED_DOCUMENT,
        ON_TRIP_NOT_SELECTED_DOCUMENT,
      ]
      const result = classifyCanhotoDocument({
        accessKeyDataAvailable: false,
        expectedDocumentId: REQUESTED_DOCUMENT.id,
        selectedDocumentIds: SELECTED_DOCUMENT_IDS,
        text: REQUESTED_KEY,
        tripDocuments: documentsWithKey,
      })
      expect(result).toEqual({ documentId: REQUESTED_DOCUMENT.id, status: 'matched' })
    })

    test('Baixos: nota liberada não entra na contagem de ambiguidade por número/série', () => {
      const releasedDuplicate: CanhotoTripDocument = {
        id: 'doc-released-duplicate',
        nfeNumber: REQUESTED_DOCUMENT.nfeNumber ?? null,
        nfeSeries: REQUESTED_DOCUMENT.nfeSeries ?? null,
        releasedAt: '2026-09-01T00:00:00.000Z',
      }
      const result = classifyCanhotoDocument({
        expectedDocumentId: REQUESTED_DOCUMENT.id,
        selectedDocumentIds: SELECTED_DOCUMENT_IDS,
        text: REQUESTED_KEY,
        tripDocuments: [...TRIP_DOCUMENTS, releasedDuplicate],
      })
      expect(result).toEqual({ documentId: REQUESTED_DOCUMENT.id, status: 'matched' })
    })
  })

  describe('classificação a partir do quadro da câmera (fixtures de imagem sintética)', () => {
    test('DANFE legível com a chave da nota pedida é matched', () => {
      const frame = buildAccessKeyBarcodeFrame(REQUESTED_KEY)
      expect(
        identifyCanhotoFromFrame({
          expectedDocumentId: REQUESTED_DOCUMENT.id,
          frame,
          selectedDocumentIds: SELECTED_DOCUMENT_IDS,
          tripDocuments: TRIP_DOCUMENTS,
        }),
      ).toEqual({ documentId: REQUESTED_DOCUMENT.id, status: 'matched' })
    })

    test('DANFE de outra nota da seleção oferece trocar', () => {
      const frame = buildAccessKeyBarcodeFrame(OTHER_SELECTED_KEY)
      expect(
        identifyCanhotoFromFrame({
          expectedDocumentId: REQUESTED_DOCUMENT.id,
          frame,
          selectedDocumentIds: SELECTED_DOCUMENT_IDS,
          tripDocuments: TRIP_DOCUMENTS,
        }),
      ).toEqual({ documentId: OTHER_SELECTED_DOCUMENT.id, status: 'otherSelected' })
    })

    test('DANFE de nota fora da viagem bloqueia', () => {
      const frame = buildAccessKeyBarcodeFrame(NOT_ON_TRIP_KEY)
      expect(
        identifyCanhotoFromFrame({
          expectedDocumentId: REQUESTED_DOCUMENT.id,
          frame,
          selectedDocumentIds: SELECTED_DOCUMENT_IDS,
          tripDocuments: TRIP_DOCUMENTS,
        }),
      ).toEqual({ documentLabel: '99999/1', status: 'notOnTrip' })
    })

    test('canhoto destacado sem código de barras é unreadable', () => {
      const frame = buildBlankBarcodeFrame()
      expect(
        identifyCanhotoFromFrame({
          expectedDocumentId: REQUESTED_DOCUMENT.id,
          frame,
          selectedDocumentIds: SELECTED_DOCUMENT_IDS,
          tripDocuments: TRIP_DOCUMENTS,
        }),
      ).toEqual({ status: 'unreadable' })
    })
  })
})
