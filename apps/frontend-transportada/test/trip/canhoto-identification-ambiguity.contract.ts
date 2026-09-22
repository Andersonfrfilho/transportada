/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Revisão da T13 (architect): número e série não identificam uma NF-e — dois emitentes numeram
 * cada um a sua. Na mesma viagem, duas notas `77777/1` de emitentes diferentes não podem virar a
 * primeira da lista. A chave inteira decide quando a nota a traz; sem ela, número e série só valem
 * com **uma** candidata, e ambiguidade é leitura inconclusiva (escolha manual), nunca palpite.
 */
import { describe, expect, test } from 'bun:test'

import {
  classifyCanhotoDocument,
  type CanhotoTripDocument,
} from '@/modules/trip/shared/canhotoIdentification.service'

/** Mesmo número (77777) e série (1), emitentes diferentes — DV mód. 11 válidos. */
const FIRST_ISSUER_KEY = '35240912345678000199550010000777771234567899'
const SECOND_ISSUER_KEY = '35240998765432000110550010000777771234567890'

const FIRST_ISSUER: CanhotoTripDocument = { id: 'doc-first', nfeNumber: '77777', nfeSeries: '1' }
const SECOND_ISSUER: CanhotoTripDocument = { id: 'doc-second', nfeNumber: '77777', nfeSeries: '1' }

function classify(input: {
  readonly documents: readonly CanhotoTripDocument[]
  readonly expectedDocumentId: string
  readonly text: string
}): ReturnType<typeof classifyCanhotoDocument> {
  return classifyCanhotoDocument({
    expectedDocumentId: input.expectedDocumentId,
    selectedDocumentIds: input.documents.map((document) => document.id),
    text: input.text,
    tripDocuments: input.documents,
  })
}

describe('canhoto de dois emitentes com o mesmo número e série (revisão da T13)', () => {
  test('sem a chave nas notas, a ambiguidade é inconclusiva — nunca a primeira da lista', () => {
    for (const expectedDocumentId of [FIRST_ISSUER.id, SECOND_ISSUER.id]) {
      expect(
        classify({
          documents: [FIRST_ISSUER, SECOND_ISSUER],
          expectedDocumentId,
          text: SECOND_ISSUER_KEY,
        }),
      ).toEqual({ status: 'unreadable' })
    }
  })

  test('com a chave nas notas, a chave inteira decide entre as duas', () => {
    const documents = [
      { ...FIRST_ISSUER, accessKey: FIRST_ISSUER_KEY },
      { ...SECOND_ISSUER, accessKey: SECOND_ISSUER_KEY },
    ]

    expect(
      classify({ documents, expectedDocumentId: FIRST_ISSUER.id, text: SECOND_ISSUER_KEY }),
    ).toEqual({ documentId: SECOND_ISSUER.id, status: 'otherSelected' })
    expect(
      classify({ documents, expectedDocumentId: FIRST_ISSUER.id, text: FIRST_ISSUER_KEY }),
    ).toEqual({ documentId: FIRST_ISSUER.id, status: 'matched' })
  })

  test('nota com outra chave não entra no casamento por número e série', () => {
    const documents = [{ ...FIRST_ISSUER, accessKey: FIRST_ISSUER_KEY }, SECOND_ISSUER]

    expect(
      classify({ documents, expectedDocumentId: FIRST_ISSUER.id, text: SECOND_ISSUER_KEY }),
    ).toEqual({ documentId: SECOND_ISSUER.id, status: 'otherSelected' })
  })

  test('chave de emitente sem nenhuma nota com aquela chave nem candidata é "fora da viagem"', () => {
    const documents = [
      { ...FIRST_ISSUER, accessKey: FIRST_ISSUER_KEY },
      { ...SECOND_ISSUER, accessKey: FIRST_ISSUER_KEY.replace('77777', '77778') },
    ]

    const result = classify({
      documents,
      expectedDocumentId: FIRST_ISSUER.id,
      text: SECOND_ISSUER_KEY,
    })

    expect(result.status).toBe('notOnTrip')
    expect(result.status === 'notOnTrip' ? result.documentLabel : '').toContain('77777')
  })
})
