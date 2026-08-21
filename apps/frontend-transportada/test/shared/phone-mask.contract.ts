/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  PHONE_MASK_LENGTH,
  PHONE_MAX_LENGTH,
  formatPhone,
  isCompletePhone,
  stripPhone,
} from '../../src/modules/shared/phone.service.js'

describe('a máscara de telefone acompanha a digitação', () => {
  test('o DDD abre entre parênteses antes do número', () => {
    expect(formatPhone('1')).toBe('(1')
    expect(formatPhone('11')).toBe('(11')
    expect(formatPhone('119')).toBe('(11) 9')
  })

  test('o celular de onze dígitos sai com cinco antes do hífen', () => {
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321')
  })

  test('o fixo de dez dígitos sai com quatro antes do hífen', () => {
    expect(formatPhone('1134567890')).toBe('(11) 3456-7890')
  })

  test('campo vazio continua vazio — a máscara não inventa parêntese', () => {
    expect(formatPhone('')).toBe('')
  })

  test('valor já mascarado atravessa a máscara sem dobrar pontuação', () => {
    expect(formatPhone('(11) 98765-4321')).toBe('(11) 98765-4321')
  })

  /** Mesma escolha do CEP: dígito excedente fica visível para a validação poder acusar. */
  test('dígito além do décimo primeiro fica visível sem máscara', () => {
    expect(formatPhone('119876543210')).toBe('119876543210')
  })
})

describe('o telefone guardado é só dígito', () => {
  test('a máscara não sobrevive ao strip', () => {
    expect(stripPhone('(11) 98765-4321')).toBe('11987654321')
  })

  test('letra não passa por dígito', () => {
    expect(stripPhone('11 9 abc 8765')).toBe('1198765')
  })
})

describe('telefone completo é fixo ou celular', () => {
  test('dez e onze dígitos são completos', () => {
    expect(isCompletePhone('1134567890')).toBe(true)
    expect(isCompletePhone('(11) 98765-4321')).toBe(true)
  })

  test('nove dígitos e doze dígitos não são', () => {
    expect(isCompletePhone('113456789')).toBe(false)
    expect(isCompletePhone('119876543210')).toBe(false)
  })

  test('vazio não é completo, e o teto é o do celular', () => {
    expect(isCompletePhone('')).toBe(false)
    expect(PHONE_MAX_LENGTH).toBe(11)
  })

  /** O `maxLength` do campo conta a pontuação: apertado demais, o hífen não caberia. */
  test('o teto do campo mascarado cabe o celular inteiro', () => {
    expect(PHONE_MASK_LENGTH).toBe(formatPhone('11987654321').length)
  })
})
