/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T002 — telefone entra no log só mascarado (`security.md` §1), e a máscara mora no logging,
 * não no call site. Ela guarda os quatro últimos dígitos para correlação e nunca o DDD.
 */
import { describe, expect, test } from 'bun:test'

import { maskPhone } from '../../src/logging/phone-mask.policy.js'

describe('maskPhone (spec 144 T002)', () => {
  test('mostra só os quatro últimos dígitos', () => {
    expect(maskPhone('5516999991234')).toBe('****1234')
  })

  test('ignora a máscara de quem digitou', () => {
    expect(maskPhone('+55 (16) 99999-1234')).toBe('****1234')
  })

  test('não expõe o DDD de número curto', () => {
    expect(maskPhone('1633334444')).toBe('****4444')
  })

  test('com menos de quatro dígitos não sobra nada visível', () => {
    expect(maskPhone('123')).toBe('****')
    expect(maskPhone('')).toBe('****')
    expect(maskPhone('abc')).toBe('****')
  })
})
