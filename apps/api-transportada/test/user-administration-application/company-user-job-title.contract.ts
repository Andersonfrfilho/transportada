/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { normalizeCompanyUserJobTitle } from '../../src/identity/domain/company-user-job-title.policy.js'

/**
 * O cargo aparece na lista e na prévia do e-mail: quebra de linha, controle e bidi não podem entrar
 * nele, e o limite conta caracteres, não bytes.
 */
describe('cargo do usuário da empresa', () => {
  test.each([
    ['quebra de linha vira espaço', 'Gerente\nComercial', 'Gerente Comercial'],
    ['CRLF vira um espaço só', 'Gerente\r\nComercial', 'Gerente Comercial'],
    ['U+2028 vira espaço', 'Gerente\u2028Comercial', 'Gerente Comercial'],
    ['U+2029 vira espaço', 'Gerente\u2029Comercial', 'Gerente Comercial'],
    ['tabulação vira espaço', 'Gerente\tComercial', 'Gerente Comercial'],
    ['controle é removido', 'Ger\u0007ente\u0000', 'Gerente'],
    ['bidi U+202A removido', 'Ger‪ente', 'Gerente'],
    ['bidi U+202B removido', 'Ger‫ente', 'Gerente'],
    ['bidi U+202C removido', 'Ger‬ente', 'Gerente'],
    ['bidi U+202D removido', 'Ger‭ente', 'Gerente'],
    ['bidi U+202E removido', 'Ger‮ente', 'Gerente'],
    ['bidi U+2066 removido', 'Ger⁦ente', 'Gerente'],
    ['bidi U+2067 removido', 'Ger⁧ente', 'Gerente'],
    ['bidi U+2068 removido', 'Ger⁨ente', 'Gerente'],
    ['bidi U+2069 removido', 'Ger⁩ente', 'Gerente'],
    ['espaços múltiplos colapsam', 'Gerente     de   frota', 'Gerente de frota'],
    ['espaços nas pontas saem', '   Gerente   ', 'Gerente'],
    ['acento é preservado', 'Coordenação', 'Coordenação'],
    ['string vazia vira null', '', null],
    ['só espaços vira null', '   \n\t  ', null],
    ['undefined vira null', undefined, null],
    ['null vira null', null, null],
  ])('%s', (_description, input, expected) => {
    expect(normalizeCompanyUserJobTitle(input)).toEqual({ ok: true, value: expected })
  })

  test('exatamente 80 caracteres é aceito', () => {
    const eighty = 'a'.repeat(80)
    expect(normalizeCompanyUserJobTitle(eighty)).toEqual({ ok: true, value: eighty })
  })

  test('81 caracteres é too_long', () => {
    expect(normalizeCompanyUserJobTitle('a'.repeat(81))).toEqual({ ok: false, reason: 'too_long' })
  })

  test('o limite conta depois de sanear: espaços e controle extras não estouram', () => {
    const padded = `${'a'.repeat(80)}\u0007   `
    expect(normalizeCompanyUserJobTitle(padded)).toEqual({ ok: true, value: 'a'.repeat(80) })
  })

  test('o limite conta caracteres e não bytes', () => {
    const eightyAccented = 'ç'.repeat(80)
    expect(normalizeCompanyUserJobTitle(eightyAccented)).toEqual({
      ok: true,
      value: eightyAccented,
    })
  })
})
