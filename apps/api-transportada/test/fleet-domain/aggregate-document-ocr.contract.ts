/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  extractCnhFields,
  extractCrlvFields,
  scoreAggregateDocumentMatch,
} from '../../src/fleet/domain/aggregate-document-ocr.policy.js'

describe('aggregate document OCR field extraction', () => {
  test('reads name, license number and category from noisy CNH text', () => {
    const text = `
      CARTEIRA NACIONAL DE HABILITAÇÃO
      NOME: FULANO DE TAL SILVA
      N HABILITACAO 12345678901
      CAT. HAB. AE
    `

    const fields = extractCnhFields(text)

    expect(fields.name).toBe('Fulano De Tal Silva')
    expect(fields.licenseNumber).toBe('12345678901')
    expect(fields.licenseCategory).toBe('AE')
  })

  test('returns nulls when nothing recognizable is found', () => {
    const fields = extractCnhFields('completely unrelated scanned garbage 42')

    expect(fields.name).toBeNull()
    expect(fields.licenseNumber).toBeNull()
    expect(fields.licenseCategory).toBeNull()
  })

  test('rejects a category outside the CONTRAN list even if the shape matches', () => {
    const fields = extractCnhFields('CAT. HAB. ZZ')
    expect(fields.licenseCategory).toBeNull()
  })

  test('reads plate and RENAVAM from CRLV text, tolerating the dash in Mercosul plates', () => {
    const fields = extractCrlvFields('PLACA ABC-1D23 RENAVAM 123456789')

    expect(fields.plate).toBe('ABC1D23')
    expect(fields.renavam).toBe('123456789')
  })
})

describe('aggregate document match scoring', () => {
  test('two matching fields out of three is high confidence', () => {
    const outcome = scoreAggregateDocumentMatch({
      declared: ['Fulano De Tal', '12345678901', 'E'],
      extracted: ['Fulano De Tal', '12345678901', 'D'],
    })

    expect(outcome.confidence).toBe('high')
    expect(outcome.matchedFieldCount).toBe(2)
  })

  test('one matching field out of three is low confidence, never auto-approves', () => {
    const outcome = scoreAggregateDocumentMatch({
      declared: ['Fulano De Tal', '12345678901', 'E'],
      extracted: ['Fulano De Tal', '00000000000', 'B'],
    })

    expect(outcome.confidence).toBe('low')
    expect(outcome.matchedFieldCount).toBe(1)
  })

  test('nothing declared yet never counts as a match, even if extraction found something', () => {
    const outcome = scoreAggregateDocumentMatch({
      declared: [null, null],
      extracted: ['ABC1D23', '123456789'],
    })

    expect(outcome.confidence).toBe('none')
  })

  test('comparison ignores case and extra whitespace', () => {
    const outcome = scoreAggregateDocumentMatch({
      declared: ['fulano  de   tal', 'abc1d23'],
      extracted: ['FULANO DE TAL', 'ABC1D23'],
    })

    expect(outcome.confidence).toBe('high')
  })
})
