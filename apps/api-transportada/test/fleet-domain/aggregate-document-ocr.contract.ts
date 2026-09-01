/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  extractCnhFields,
  extractCrlvFields,
  scoreAggregateDocumentMatch,
  listAggregateDocumentDivergences,
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

  /**
   * CPF e registro de CNH têm onze dígitos os dois, e na CNH-e o CPF costuma vir impresso antes.
   * Pegar "o primeiro número de onze dígitos" trocava um pelo outro — e valor errado é pior que
   * valor ausente: ele vira divergência contra um documento correto.
   */
  test('does not mistake the CPF for the licence number when both are eleven digits', () => {
    const text = `
      NOME: FULANO DE TAL DA SILVA
      CPF 12345678909
      Nº REGISTRO 98765432100
      CAT. HAB: AE
    `

    const fields = extractCnhFields(text)

    expect(fields.licenseNumber).toBe('98765432100')
  })

  /** Sem rótulo que ancore o número, a leitura declara ausência — nunca chuta o dígito que passar. */
  test('reports absence instead of guessing when no licence label is present', () => {
    const fields = extractCnhFields('NOME: FULANO DE TAL\nCPF 12345678909')

    expect(fields.licenseNumber).toBeNull()
  })

  /** RENAVAM também tem onze dígitos: um CRLV lido como CNH não pode virar número de habilitação. */
  test('does not read a RENAVAM as a licence number', () => {
    const fields = extractCnhFields('CODIGO RENAVAM 00761638261 PLACA DFJ2208')

    expect(fields.licenseNumber).toBeNull()
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

  /**
   * Dentro do próprio CRLV moram outros números de onze dígitos — o CPF do proprietário e o código
   * de segurança do CLA. Pegar "o primeiro de nove a onze dígitos" dependia da ordem em que o
   * extrator devolvesse a página, e a ordem não é contrato. O RENAVAM tem dígito verificador; é ele
   * quem decide, não a posição.
   */
  test('skips the owner CPF and reads the RENAVAM that validates', () => {
    const fields = extractCrlvFields('CPF 12345678909 CODIGO RENAVAM 00761638261 PLACA DFJ2208')

    expect(fields.renavam).toBe('00761638261')
  })

  test('skips the CRLV security code, which is eleven digits too', () => {
    const fields = extractCrlvFields('CODIGO DE SEGURANCA DO CLA 23471451544 RENAVAM 00761638261')

    expect(fields.renavam).toBe('00761638261')
  })

  /** Nenhum candidato válido é ausência — e ausência não vira divergência. */
  test('reports absence when no candidate passes the check digit', () => {
    const fields = extractCrlvFields('CPF 12345678909 DOC 98765432100')

    expect(fields.renavam).toBeNull()
  })

  /** Campo preenchido com zeros passa no dígito verificador e mesmo assim não é RENAVAM nenhum. */
  test('rejects a run of identical digits even though the check digit accepts it', () => {
    const fields = extractCrlvFields('RENAVAM 00000000000')

    expect(fields.renavam).toBeNull()
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

describe('divergência entre o documento e a ficha', () => {
  const DECLARED = {
    licenseCategory: 'AE',
    licenseNumber: '12345678901',
    name: 'Jose da Silva',
    plate: null,
    renavam: null,
  }

  test('aponta o campo em que o documento e a ficha discordam, com os dois valores', () => {
    const divergences = listAggregateDocumentDivergences({
      declared: DECLARED,
      extracted: { licenseCategory: 'AE', licenseNumber: '99999999999', name: 'Jose da Silva' },
    })

    expect(divergences).toEqual([
      { declared: '12345678901', extracted: '99999999999', field: 'licenseNumber' },
    ])
  })

  test('não acusa diferença de caixa nem de espaço — é a mesma pessoa escrita torto', () => {
    const divergences = listAggregateDocumentDivergences({
      declared: DECLARED,
      extracted: { licenseCategory: 'ae', licenseNumber: '12345678901', name: 'JOSE  DA SILVA' },
    })

    expect(divergences).toEqual([])
  })

  /** Ausência não é conflito: acusá-la faria o operador desconfiar de documento correto. */
  test('campo que a leitura não achou, e campo que ninguém declarou, ficam de fora', () => {
    const divergences = listAggregateDocumentDivergences({
      declared: DECLARED,
      extracted: {
        licenseCategory: null,
        licenseNumber: '',
        name: 'Jose da Silva',
        plate: 'ABC1D23',
      },
    })

    expect(divergences).toEqual([])
  })

  test('lista todos os campos que discordam, não só o primeiro', () => {
    const divergences = listAggregateDocumentDivergences({
      declared: DECLARED,
      extracted: { licenseCategory: 'B', licenseNumber: '99999999999', name: 'Outra Pessoa' },
    })

    expect(divergences.map((item) => item.field).sort()).toEqual([
      'licenseCategory',
      'licenseNumber',
      'name',
    ])
  })
})
