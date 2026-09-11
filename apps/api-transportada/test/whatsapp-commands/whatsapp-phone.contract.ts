/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T002 — o telefone tem uma forma só: `55` + DDD + número, só dígitos. É ela que casa o
 * remetente da Meta com o número verificado do usuário, então toda grafia que um humano digita tem de
 * cair nela, e tudo que não é telefone brasileiro tem de cair fora. A mesma tabela roda no worker,
 * contra a cópia por valor da política.
 */
import { describe, expect, test } from 'bun:test'

import {
  isSameWhatsAppPhone,
  toWhatsAppPhone,
} from '../../src/whatsapp-commands/domain/whatsapp-phone.policy.js'

const CANONICAL_CASES: ReadonlyArray<readonly [string, string, string]> = [
  ['celular sem país', '16999991234', '5516999991234'],
  ['fixo sem país', '1633334444', '551633334444'],
  ['celular com país', '5516999991234', '5516999991234'],
  ['fixo com país', '551633334444', '551633334444'],
  ['celular com +55 e espaço', '+55 16 99999-1234', '5516999991234'],
  ['celular com máscara', '(16) 99999-1234', '5516999991234'],
  ['fixo com espaço nas pontas', ' 16 3333 4444 ', '551633334444'],
  ['DDD 55 local com 11 dígitos', '55999991234', '5555999991234'],
  ['DDD 55 local com 10 dígitos', '5533334444', '555533334444'],
  ['DDD 55 com país', '5555999991234', '5555999991234'],
]

const REJECTED_CASES: ReadonlyArray<readonly [string, string]> = [
  ['vazio', ''],
  ['só espaço', '   '],
  ['lixo', 'abc'],
  ['letra no meio dos dígitos', '16a99991234'],
  ['DDD começando em zero', '01699991234'],
  ['DDD começando em zero com país', '5501699991234'],
  ['curto demais', '123'],
  ['nove dígitos', '999991234'],
  ['55 seguido de comprimento errado', '55123'],
  ['doze dígitos de outro país', '441633334444'],
  ['treze dígitos de outro país', '4416999991234'],
  ['catorze dígitos', '55016999991234'],
]

describe('toWhatsAppPhone (spec 144 T002)', () => {
  for (const [label, raw, canonical] of CANONICAL_CASES) {
    test(`${label}: ${JSON.stringify(raw)} vira ${canonical}`, () => {
      expect(toWhatsAppPhone(raw)).toBe(canonical)
    })
  }

  for (const [label, raw] of REJECTED_CASES) {
    test(`${label}: ${JSON.stringify(raw)} não é telefone`, () => {
      expect(toWhatsAppPhone(raw)).toBeUndefined()
    })
  }
})

describe('isSameWhatsAppPhone (spec 144 T002)', () => {
  test('grafias diferentes do mesmo número são o mesmo número', () => {
    expect(isSameWhatsAppPhone('(16) 99999-1234', '5516999991234')).toBe(true)
  })

  test('o wa_id de celular sem o nono dígito casa com o número verificado', () => {
    expect(isSameWhatsAppPhone('5516999991234', '551699991234')).toBe(true)
    expect(isSameWhatsAppPhone('551699991234', '5516999991234')).toBe(true)
  })

  test('a equivalência só vale quando o dígito depois do DDD é 9', () => {
    expect(isSameWhatsAppPhone('5516899991234', '551699991234')).toBe(false)
  })

  test('números diferentes não casam', () => {
    expect(isSameWhatsAppPhone('5516999991234', '5516999991235')).toBe(false)
    expect(isSameWhatsAppPhone('551633334444', '551733334444')).toBe(false)
  })

  test('entrada inválida nunca casa, nem com ela mesma', () => {
    expect(isSameWhatsAppPhone('abc', 'abc')).toBe(false)
    expect(isSameWhatsAppPhone('', '5516999991234')).toBe(false)
    expect(isSameWhatsAppPhone('5516999991234', '123')).toBe(false)
  })
})
