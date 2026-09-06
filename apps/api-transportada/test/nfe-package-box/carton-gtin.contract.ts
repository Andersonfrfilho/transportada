/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { reduceToGtin13 } from '../../src/nfe-documents/domain/package-box-queue.policy.js'

describe('a etiqueta que o conferente bipa (spec 085 G005)', () => {
  /**
   * A caixa traz DUN-14, o produto traz GTIN-13, e o cadastro casa pelo segundo — medido em 90% das
   * caixas. Sem a redução o leitor acha a etiqueta e o cadastro não acha o produto.
   */
  test('reduz o DUN-14 ao GTIN-13 do produto, recalculando o dígito', () => {
    expect(reduceToGtin13('17896004003405')).toBe('7896004003405')
  })

  test('o GTIN-13 lido passa intacto', () => {
    expect(reduceToGtin13('7896004003405')).toBe('7896004003405')
  })

  /** Etiqueta suja, leitura parcial, código de outra coisa: devolver palpite seria pior que nada. */
  test('o que não é GTIN não vira GTIN', () => {
    expect(reduceToGtin13('12345')).toBeNull()
    expect(reduceToGtin13('789600400340A')).toBeNull()
    expect(reduceToGtin13('')).toBeNull()
  })

  /** GTIN-8 e GTIN-12 existem na prateleira e não são DUN: não se mexe neles. */
  test('GTIN-8 e GTIN-12 voltam como vieram', () => {
    expect(reduceToGtin13('78901234')).toBe('78901234')
    expect(reduceToGtin13('012345678905')).toBe('012345678905')
  })
})
