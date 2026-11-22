/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T3 (RF5, ADR-0081 §9): o painel aceita `canhotoMismatch` no comprovante **antes** de a API
 * mandá-lo. Sem isto a chave nova faria `isDeliveryProof` descartar o comprovante inteiro, nas duas
 * leituras (a da nota e a do maço). Alerta malformado sai sozinho; o comprovante fica.
 */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  CANHOTO_MISMATCH_KEYS,
  CANHOTO_MISMATCH_KINDS,
  CANHOTO_MISMATCH_MATCHED_DOCUMENT_KEYS,
} from '../../src/modules/trip/shared/canhotoMismatch.validation'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'

const PENDING_PROOF = {
  canhotoReadNumber: '172195',
  canhotoReadSeries: '1',
  canhotoReadSource: 'ocr' as const,
  canhotoReview: 'pending' as const,
  createdAt: '2026-11-22T12:01:00.000Z',
  downloadUrl: 'https://bucket.example/p1.jpg?assinatura=original',
  expiresAt: '2026-11-22T12:06:00.000Z',
  id: 'p1',
  kind: 'photo' as const,
  receiverName: 'Maria',
}

const MATCHED = {
  canhotoApproved: false,
  nfeDocumentId: 'nfe-172195',
  number: '172195',
  sameTrip: true,
  series: '1',
  status: 'authorized' as const,
  tripDocumentId: 'vinculo-172195',
  tripId: 'viagem-1',
}

const WITH_MATCH = {
  kind: 'other_document' as const,
  matchedDocument: MATCHED,
  readNumber: '172195',
  readSeries: '1',
}

const WITHOUT_MATCH = {
  kind: 'other_document' as const,
  matchedDocument: null,
  readNumber: '172195',
  readSeries: null,
}

const MALFORMED = [
  ['tipo fora do vocabulário', { ...WITH_MATCH, kind: 'same_document' }],
  ['número vazio', { ...WITH_MATCH, readNumber: '' }],
  ['chave a mais', { ...WITH_MATCH, readText: 'texto do OCR' }],
  ['chave faltando', { kind: 'other_document', readNumber: '172195', readSeries: null }],
  ['nota com estado desconhecido', { ...WITH_MATCH, matchedDocument: { ...MATCHED, status: 'x' } }],
  [
    'nota com chave a mais',
    { ...WITH_MATCH, matchedDocument: { ...MATCHED, recipientName: 'Fulano' } },
  ],
  ['null em vez de ausente', null],
] as const

describe('o comprovante aceita o alerta de canhoto de outra nota (spec 344 RF5)', () => {
  const adapters = createTripResponseAdapters()

  for (const [label, mismatch] of [
    ['com a NF citada', WITH_MATCH],
    ['sem NF citada', WITHOUT_MATCH],
  ] as const) {
    it(`leitura da nota: alerta ${label} passa inteiro`, () => {
      const [proof] = adapters.deliveryProofsFromApi([
        { ...PENDING_PROOF, canhotoMismatch: mismatch },
      ])
      expect(proof?.canhotoMismatch).toEqual(mismatch)
    })

    it(`leitura do maço: alerta ${label} passa inteiro, com o documentId`, () => {
      const [proof] = adapters.tripDeliveryProofsFromApi([
        { ...PENDING_PROOF, canhotoMismatch: mismatch, documentId: 'doc-a' },
      ])
      expect(proof?.documentId).toBe('doc-a')
      expect(proof?.canhotoMismatch).toEqual(mismatch)
    })
  }

  it('sem o alerta, o comprovante segue igual (API antiga)', () => {
    const [proof] = adapters.deliveryProofsFromApi([PENDING_PROOF])
    expect(proof).toEqual(PENDING_PROOF)
  })

  for (const [label, mismatch] of MALFORMED) {
    it(`alerta malformado (${label}) sai sozinho e o comprovante fica`, () => {
      const [single] = adapters.deliveryProofsFromApi([
        { ...PENDING_PROOF, canhotoMismatch: mismatch },
      ])
      const [ofTrip] = adapters.tripDeliveryProofsFromApi([
        { ...PENDING_PROOF, canhotoMismatch: mismatch, documentId: 'doc-a' },
      ])

      expect(single).toEqual(PENDING_PROOF)
      expect(ofTrip).toEqual({ ...PENDING_PROOF, documentId: 'doc-a' })
    })
  }

  it('chave desconhecida fora do alerta continua derrubando o comprovante', () => {
    expect(adapters.deliveryProofsFromApi([{ ...PENDING_PROOF, readText: 'x' }])).toEqual([])
  })
})

/**
 * Paridade com a API: o vocabulário e as chaves da nota citada são os de
 * `canhoto-mismatch.policy.ts`. Tipo novo lá sem esta cópia faria o painel descartar o alerta calado.
 */
describe('paridade do alerta com a API (spec 344 RF5)', () => {
  const apiSource = readFileSync(
    new URL(
      '../../../api-transportada/src/trips/domain/canhoto-mismatch.policy.ts',
      import.meta.url,
    ),
    'utf8',
  )

  it('os tipos do alerta são os mesmos', () => {
    const match = /CANHOTO_MISMATCH_KINDS = \[([^\]]*)\]/u.exec(apiSource)
    const apiKinds = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/gu)].map((item) => item[1])
    expect(apiKinds).toEqual([...CANHOTO_MISMATCH_KINDS])
  })

  it('as chaves da nota citada são as do tipo da API', () => {
    const block = /export type CanhotoMismatchMatchedDocument = \{([^}]*)\}/u.exec(apiSource)
    const apiKeys = [...(block?.[1] ?? '').matchAll(/readonly (\w+):/gu)].map((item) => item[1])
    expect(apiKeys.sort()).toEqual([...CANHOTO_MISMATCH_MATCHED_DOCUMENT_KEYS].sort())
  })

  it('as chaves do alerta são as do tipo da API', () => {
    const block = /export type CanhotoMismatch = \{([^}]*)\}/u.exec(apiSource)
    const apiKeys = [...(block?.[1] ?? '').matchAll(/readonly (\w+):/gu)].map((item) => item[1])
    expect(apiKeys.sort()).toEqual([...CANHOTO_MISMATCH_KEYS].sort())
  })
})
