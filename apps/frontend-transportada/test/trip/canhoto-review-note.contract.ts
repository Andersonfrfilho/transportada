/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * Spec 220 T7.7/RF28: a guarda do cliente é cópia da do servidor
 * (`api-transportada/src/shared/personal-data.policy.ts` + limites de
 * `canhoto-review-decision.policy.ts`). Os casos abaixo vêm de
 * `api-transportada/test/personal-data/detection.contract.ts`: se a API mudar, este arquivo é o
 * que reprova, e não o usuário. Todos os valores são sintéticos.
 */
import { describe, expect, test } from 'bun:test'

import {
  CANHOTO_REVIEW_NOTE_ERROR,
  CANHOTO_REVIEW_NOTE_MAXIMUM_LENGTH,
  CANHOTO_REVIEW_NOTE_MINIMUM_LENGTH,
  validateCanhotoReviewNote,
} from '@/modules/trip/shared/canhotoReviewNote.validation'

describe('o que a guarda recusa (espelho do servidor)', () => {
  test('e-mail, em qualquer lugar da frase', () => {
    expect(
      validateCanhotoReviewNote('falar com contato@transportadora.com.br antes de refazer'),
    ).toBe(CANHOTO_REVIEW_NOTE_ERROR.PERSONAL_DATA)
  })

  test('CNPJ, pontuado ou cru', () => {
    for (const text of ['emitente 12.345.678/0001-99 recusou', 'emitente 12345678000199 recusou']) {
      expect(validateCanhotoReviewNote(text)).toBe(CANHOTO_REVIEW_NOTE_ERROR.PERSONAL_DATA)
    }
  })

  test('CPF, pontuado ou cru', () => {
    for (const text of [
      'recebedor 123.456.789-09 assinou por fora',
      'recebedor 12345678909 assinou por fora',
    ]) {
      expect(validateCanhotoReviewNote(text)).toBe(CANHOTO_REVIEW_NOTE_ERROR.PERSONAL_DATA)
    }
  })

  test('CEP', () => {
    expect(validateCanhotoReviewNote('entregar no 01310-100, portaria dos fundos')).toBe(
      CANHOTO_REVIEW_NOTE_ERROR.PERSONAL_DATA,
    )
  })

  test('telefone, com e sem DDI', () => {
    for (const text of [
      'ligar (11) 98888-7777 para combinar',
      'ligar +55 11 98888-7777 para combinar',
    ]) {
      expect(validateCanhotoReviewNote(text)).toBe(CANHOTO_REVIEW_NOTE_ERROR.PERSONAL_DATA)
    }
  })

  test('telefone em todas as formas de escrita', () => {
    for (const phone of ['(11) 98765-4321', '11987654321', '+55 11 98765-4321', '11 9876-5432']) {
      expect(validateCanhotoReviewNote(`ligar ${phone} hoje`)).toBe(
        CANHOTO_REVIEW_NOTE_ERROR.PERSONAL_DATA,
      )
    }
  })

  test('onze dígitos crus são recusados', () => {
    expect(validateCanhotoReviewNote('anotar 11988887777 na ficha')).toBe(
      CANHOTO_REVIEW_NOTE_ERROR.PERSONAL_DATA,
    )
  })

  test('dez dígitos crus são recusados — telefone fixo sem pontuação', () => {
    expect(validateCanhotoReviewNote('anotar 1133334444 na ficha do canhoto')).toBe(
      CANHOTO_REVIEW_NOTE_ERROR.PERSONAL_DATA,
    )
  })
})

describe('o que a guarda deixa passar', () => {
  const ACCEPTED_REASONS = [
    'canhoto ilegível, refazer a foto com mais luz',
    'assinatura do recebedor não aparece na foto enviada',
    'foto da nota 000123456, e não do canhoto assinado',
    'chegou 2 horas depois do combinado, recusa registrada',
    'faltaram 3 volumes dos 12 da carga, conferir antes',
    'valor cobrado a maior: R$ 1.234,56 em vez de R$ 987,00',
  ] as const

  test('motivo legítimo não é confundido com dado pessoal', () => {
    for (const reason of ACCEPTED_REASONS) {
      expect(validateCanhotoReviewNote(reason)).toBeUndefined()
    }
  })

  test('sequência longa de dígitos não vira telefone só porque o final dela parece um', () => {
    const accessKey = '35260912345678000199550010000012341000012345'
    expect(validateCanhotoReviewNote(`a chave ${accessKey} não bate com a nota`)).toBeUndefined()
    expect(validateCanhotoReviewNote('protocolo 202609301234 não confere')).toBeUndefined()
    expect(validateCanhotoReviewNote('nota 123456789 ilegível, refazer')).toBeUndefined()
  })
})

describe('limites de tamanho (20 a 500, como no servidor)', () => {
  test('as constantes espelham o servidor', () => {
    expect(CANHOTO_REVIEW_NOTE_MINIMUM_LENGTH).toBe(20)
    expect(CANHOTO_REVIEW_NOTE_MAXIMUM_LENGTH).toBe(500)
  })

  test('vazio e curto demais', () => {
    expect(validateCanhotoReviewNote('')).toBe(CANHOTO_REVIEW_NOTE_ERROR.TOO_SHORT)
    expect(validateCanhotoReviewNote('a'.repeat(19))).toBe(CANHOTO_REVIEW_NOTE_ERROR.TOO_SHORT)
  })

  test('vinte e quinhentos passam; quinhentos e um não', () => {
    expect(validateCanhotoReviewNote('a'.repeat(20))).toBeUndefined()
    expect(validateCanhotoReviewNote('a'.repeat(500))).toBeUndefined()
    expect(validateCanhotoReviewNote('a'.repeat(501))).toBe(CANHOTO_REVIEW_NOTE_ERROR.TOO_LONG)
  })

  test('o tamanho é checado antes do dado pessoal, como no servidor', () => {
    expect(validateCanhotoReviewNote('11987654321')).toBe(CANHOTO_REVIEW_NOTE_ERROR.TOO_SHORT)
  })
})
