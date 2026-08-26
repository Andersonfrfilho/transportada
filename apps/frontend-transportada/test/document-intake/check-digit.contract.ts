/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  isValidChassis,
  isValidCnpj,
  isValidCpf,
  isValidPlate,
  isValidRenavam,
  isValidState,
} from '../../src/modules/document-intake/shared/checkDigit.service'

describe('CPF check digit (spec 048)', () => {
  test('accepts a CPF whose digits close', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('52998224725')).toBe(true)
  })

  /** Um dígito trocado é erro de leitura do PDF — e é exatamente o que o verificador existe para pegar. */
  test('refuses a CPF with a single wrong digit', () => {
    expect(isValidCpf('529.982.247-26')).toBe(false)
    expect(isValidCpf('529.982.247-35')).toBe(false)
  })

  /**
   * `111.111.111-11` **fecha a conta** e não é documento de ninguém. Sem este corte o campo se
   * pré-preencheria com um CPF que a Receita não conhece.
   */
  test('refuses a repeated-digit CPF even though the arithmetic closes', () => {
    for (const digit of '0123456789') {
      expect(isValidCpf(digit.repeat(11))).toBe(false)
    }
  })

  test('refuses anything that is not eleven digits', () => {
    expect(isValidCpf('5299822472')).toBe(false)
    expect(isValidCpf('529982247250')).toBe(false)
    expect(isValidCpf('')).toBe(false)
  })
})

describe('CNPJ check digit (spec 048, IN RFB 2229/2024)', () => {
  test('accepts a numeric CNPJ whose digits close', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11222333000181')).toBe(true)
  })

  test('refuses a numeric CNPJ with a wrong digit', () => {
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false)
  })

  /**
   * O CNPJ alfanumérico está em produção desde 01/07/2026. Tratar a base como número puro
   * recusaria todo documento emitido a partir dessa data — e o valor de cada caractere é o código
   * ASCII menos 48, de modo que `'A'` vale 17.
   */
  test('accepts a CNPJ whose base carries letters, which is the rule since July 2026', () => {
    // 12 posições alfanuméricas + 2 dígitos calculados pela mesma regra
    expect(isValidCnpj('12ABC34501DE35')).toBe(true)
  })

  test('refuses a letter in the two verifying positions, which stay numeric', () => {
    expect(isValidCnpj('12ABC34501DEAB')).toBe(false)
  })

  test('refuses a repeated-character CNPJ', () => {
    expect(isValidCnpj('11111111111111')).toBe(false)
  })
})

describe('RENAVAM check digit (spec 048)', () => {
  test('accepts a RENAVAM whose digit closes', () => {
    expect(isValidRenavam('00123456789')).toBe(true)
  })

  test('refuses a RENAVAM with a wrong final digit', () => {
    expect(isValidRenavam('00123456788')).toBe(false)
  })

  /** Registro antigo tem menos de onze dígitos: recusar por tamanho rejeitaria veículo de verdade. */
  test('pads a short legacy registration instead of rejecting it', () => {
    expect(isValidRenavam('123456789')).toBe(isValidRenavam('00123456789'))
  })
})

describe('closed formats (spec 048)', () => {
  test('accepts both plate patterns the fleet already uses', () => {
    expect(isValidPlate('GCQ8E47')).toBe(true)
    expect(isValidPlate('FFV2D95')).toBe(true)
    expect(isValidPlate('ABC1234')).toBe(true)
  })

  test('refuses a plate that is not one', () => {
    expect(isValidPlate('AB1234')).toBe(false)
    expect(isValidPlate('ABCD123')).toBe(false)
  })

  /** O chassi não usa I, O nem Q — elas se confundem com 1 e 0, e a norma as exclui. */
  test('refuses the three letters a chassis never carries', () => {
    expect(isValidChassis('9BWZZZ377VT004251')).toBe(true)
    expect(isValidChassis('9BWZZZ377VT00425I')).toBe(false)
    expect(isValidChassis('9BWZZZ377VT00425O')).toBe(false)
    expect(isValidChassis('9BWZZZ377VT00425Q')).toBe(false)
  })

  test('refuses a chassis that is not seventeen characters', () => {
    expect(isValidChassis('9BWZZZ377VT00425')).toBe(false)
  })

  test('knows the twenty-seven states and nothing else', () => {
    expect(isValidState('SP')).toBe(true)
    expect(isValidState('sp')).toBe(true)
    expect(isValidState('XX')).toBe(false)
    expect(isValidState('')).toBe(false)
  })
})
