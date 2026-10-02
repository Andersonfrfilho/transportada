/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T6.1 (RF-B3): a régua da chave de acesso do worker é a **mesma** do navegador. As chaves
 * abaixo são cópia por valor de `apps/frontend-transportada/test/trip/canhoto-identification.contract.ts`
 * — se uma das duas réguas mudar, a outra tem de mudar com ela, e é esta tabela que denuncia.
 */
import { describe, expect, test } from 'bun:test'

import {
  identifyCanhotoBarcode,
  parseNfeAccessKeyFromBarcode,
  type CanhotoTripDocument,
} from '../../src/canhoto-read/domain/canhoto-barcode.policy.js'

const REQUESTED_KEY = '35240912345678000199550010000123451876543212'
const OTHER_SELECTED_KEY = '35240912345678000199550010000123461876543228'
const NOT_ON_TRIP_KEY = '35240912345678000199550010000999991111122222'
const MODEL_65_KEY = '35240912345678000199650010000123451876543215'
const BAD_CHECK_DIGIT_KEY = '35240912345678000199550010000123451876543213'
const ALPHANUMERIC_CNPJ_KEY = '35240912ABC456780001550010000123451876543211'
/** Mesmo número e série (77777/1) de dois emitentes diferentes. */
const AMBIGUOUS_FIRST_KEY = '35240912345678000199550010000777771234567899'
const AMBIGUOUS_SECOND_KEY = '35240998765432000110550010000777771234567890'

const REQUESTED_DOCUMENT: CanhotoTripDocument = {
  accessKey: REQUESTED_KEY,
  id: 'doc-requested',
  nfeNumber: '12345',
  nfeSeries: '1',
  releasedAt: null,
}
const OTHER_DOCUMENT: CanhotoTripDocument = {
  accessKey: OTHER_SELECTED_KEY,
  id: 'doc-other',
  nfeNumber: '12346',
  nfeSeries: '1',
  releasedAt: null,
}
const TRIP_DOCUMENTS: readonly CanhotoTripDocument[] = [REQUESTED_DOCUMENT, OTHER_DOCUMENT]

function identify(text: string | null, tripDocuments = TRIP_DOCUMENTS) {
  return identifyCanhotoBarcode({ text, tripDocuments })
}

describe('worker access-key rule mirrors the browser (spec 222 T6.1)', () => {
  describe('parseNfeAccessKeyFromBarcode', () => {
    test('extracts number and series without leading zeros', () => {
      expect(parseNfeAccessKeyFromBarcode(REQUESTED_KEY)).toEqual({ number: '12345', series: '1' })
    })

    test('refuses a wrong mod-11 check digit', () => {
      expect(parseNfeAccessKeyFromBarcode(BAD_CHECK_DIGIT_KEY)).toBeUndefined()
    })

    test('refuses model 65 (NFC-e): only model 55 is an NF-e key', () => {
      expect(parseNfeAccessKeyFromBarcode(MODEL_65_KEY)).toBeUndefined()
    })

    test('refuses text that is not shaped like a key', () => {
      expect(parseNfeAccessKeyFromBarcode('ISBN 978-3-16-148410-0')).toBeUndefined()
      expect(parseNfeAccessKeyFromBarcode(REQUESTED_KEY.slice(0, 43))).toBeUndefined()
      expect(parseNfeAccessKeyFromBarcode(`${REQUESTED_KEY}0`)).toBeUndefined()
      expect(parseNfeAccessKeyFromBarcode('')).toBeUndefined()
    })

    test('accepts the alphanumeric CNPJ of NT 2024.002', () => {
      expect(parseNfeAccessKeyFromBarcode(ALPHANUMERIC_CNPJ_KEY)).toEqual({
        number: '12345',
        series: '1',
      })
    })
  })

  describe('identifyCanhotoBarcode', () => {
    test('a key that is on the trip reports that note, the number, the series and the source', () => {
      expect(identify(REQUESTED_KEY)).toEqual({
        kind: 'read',
        readDocumentId: REQUESTED_DOCUMENT.id,
        readNumber: '12345',
        readSeries: '1',
        readSource: 'barcode',
      })
    })

    test("another note's key reports the other note: the server, not the worker, says it does not match", () => {
      expect(identify(OTHER_SELECTED_KEY)).toEqual({
        kind: 'read',
        readDocumentId: OTHER_DOCUMENT.id,
        readNumber: '12346',
        readSeries: '1',
        readSource: 'barcode',
      })
    })

    test('a valid key that is not on the trip still reports the number it read, with no note', () => {
      expect(identify(NOT_ON_TRIP_KEY)).toEqual({
        kind: 'read',
        readDocumentId: null,
        readNumber: '99999',
        readSeries: '1',
        readSource: 'barcode',
      })
    })

    test('no code, a bad check digit, model 65 and garbage are all unusable', () => {
      expect(identify(null)).toEqual({ kind: 'unusable' })
      expect(identify(BAD_CHECK_DIGIT_KEY)).toEqual({ kind: 'unusable' })
      expect(identify(MODEL_65_KEY)).toEqual({ kind: 'unusable' })
      expect(identify('ISBN 978-3-16-148410-0')).toEqual({ kind: 'unusable' })
      expect(identify('   ')).toEqual({ kind: 'unusable' })
    })

    test('the exact key wins even when another note repeats the number and series', () => {
      const documents: readonly CanhotoTripDocument[] = [
        { ...REQUESTED_DOCUMENT, accessKey: AMBIGUOUS_FIRST_KEY, nfeNumber: '77777' },
        { ...OTHER_DOCUMENT, accessKey: AMBIGUOUS_SECOND_KEY, nfeNumber: '77777' },
      ]
      expect(identify(AMBIGUOUS_SECOND_KEY, documents)).toMatchObject({
        readDocumentId: OTHER_DOCUMENT.id,
      })
    })

    test('without a key on the note, number and series identify it only when exactly one note fits', () => {
      const withoutKey: readonly CanhotoTripDocument[] = [
        { ...REQUESTED_DOCUMENT, accessKey: null },
        { ...OTHER_DOCUMENT, accessKey: '' },
      ]
      expect(identify(REQUESTED_KEY, withoutKey)).toMatchObject({
        readDocumentId: REQUESTED_DOCUMENT.id,
      })
    })

    test('two notes without a key sharing number and series are ambiguous: never the first one', () => {
      const ambiguous: readonly CanhotoTripDocument[] = [
        { accessKey: null, id: 'doc-a', nfeNumber: '77777', nfeSeries: '1', releasedAt: null },
        { accessKey: null, id: 'doc-b', nfeNumber: '77777', nfeSeries: '1', releasedAt: null },
      ]
      expect(identify(AMBIGUOUS_FIRST_KEY, ambiguous)).toEqual({
        kind: 'read',
        readDocumentId: null,
        readNumber: '77777',
        readSeries: '1',
        readSource: 'barcode',
      })
    })

    test('a released note does not count towards ambiguity by number and series', () => {
      const releasedDuplicate: CanhotoTripDocument = {
        accessKey: null,
        id: 'doc-released',
        nfeNumber: '12345',
        nfeSeries: '1',
        releasedAt: new Date('2026-09-01T00:00:00.000Z'),
      }
      const documents: readonly CanhotoTripDocument[] = [
        { ...REQUESTED_DOCUMENT, accessKey: null },
        releasedDuplicate,
      ]
      expect(identify(REQUESTED_KEY, documents)).toMatchObject({
        readDocumentId: REQUESTED_DOCUMENT.id,
      })
    })

    test('a note that carries another key is discarded from the number and series fallback', () => {
      const documents: readonly CanhotoTripDocument[] = [
        { ...REQUESTED_DOCUMENT, accessKey: AMBIGUOUS_SECOND_KEY },
      ]
      expect(identify(REQUESTED_KEY, documents)).toMatchObject({ readDocumentId: null })
    })

    test('the text is trimmed before it is judged', () => {
      expect(identify(`  ${REQUESTED_KEY}\n`)).toMatchObject({
        readDocumentId: REQUESTED_DOCUMENT.id,
      })
    })
  })
})
