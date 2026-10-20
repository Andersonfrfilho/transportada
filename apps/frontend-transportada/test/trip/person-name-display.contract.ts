/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { formatPersonName } from '@/lib/personName'

describe('exibição de nome de pessoa', () => {
  test('primeiras letras maiúsculas', () => {
    expect(formatPersonName('anderson fernandes r filho')).toBe('Anderson Fernandes R Filho')
  })

  test('partículas ficam em minúsculas e o excesso de espaço some', () => {
    expect(formatPersonName('  MARIA  DA SILVA e souza ')).toBe('Maria da Silva e Souza')
  })

  test('nome composto com hífen e vazio', () => {
    expect(formatPersonName("ana-clara d'ávila")).toBe("Ana-Clara D'Ávila")
    expect(formatPersonName('')).toBe('')
  })
})
