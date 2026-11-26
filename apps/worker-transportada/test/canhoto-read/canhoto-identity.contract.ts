/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T1 / CA02: `extractCanhotoIdentity` lê o Nº/Série **impresso** no canhoto, ancorado pelo rótulo
 * ("NF-e", "Nº", "SÉRIE"). Número solto não vale, dois números ancorados que discordam não valem, e o
 * resultado é só `{ number, series }` em dígitos — nunca o texto reconhecido. Linhas sintéticas: as fotos
 * reais da T0 são dado de cliente e não entram no repositório.
 */
import { describe, expect, test } from 'bun:test'

import { extractCanhotoIdentity } from '../../src/canhoto-read/domain/canhoto-identity.policy.js'

/** O canhoto do caso real (NF 931988 com a foto da NF 172195 série 1), redigitado sem dado de cliente. */
const STUB_LINES = [
  'RECEBEMOS DE TRANSPORTES EXEMPLO LTDA OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO',
  'DATA DE RECEBIMENTO',
  'IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR',
  'NF-e',
  'Nº 000.172.195',
  'SÉRIE 001',
] as const

function read(lines: readonly string[]) {
  return extractCanhotoIdentity(lines)
}

describe('extractCanhotoIdentity (spec 344 T1, CA02)', () => {
  describe('anchored number and series', () => {
    test('reads the printed number and series of the stub, without leading zeros', () => {
      expect(read(STUB_LINES)).toEqual({ number: '172195', series: '1' })
    })

    test('reads number and series on the same line, in either order', () => {
      expect(read(['NF-e Nº 000.932.062 SÉRIE 001'])).toEqual({ number: '932062', series: '1' })
      expect(read(['SÉRIE 2 NF-e Nº 000.932.062'])).toEqual({ number: '932062', series: '2' })
    })

    test('reads the series printed before the number on another line', () => {
      expect(read(['SÉRIE: 003', 'NF-e', 'Nº 932.085'])).toEqual({ number: '932085', series: '3' })
    })

    test('number without series is valid: series is null ("série não lida")', () => {
      expect(read(['NF-e', 'Nº 000.932.085'])).toEqual({ number: '932085', series: null })
    })

    test('the NF-e label alone anchors the number', () => {
      expect(read(['NF-e 000.172.195'])).toEqual({ number: '172195', series: null })
      expect(read(['NOTA FISCAL ELETRÔNICA', '172195'])).toEqual({ number: '172195', series: null })
    })

    test('the Nº label alone anchors the number', () => {
      expect(read(['Nº 172195'])).toEqual({ number: '172195', series: null })
    })

    test('the label may end one line and the number start the next', () => {
      expect(read(['NF-e Nº', '000.172.195', 'SÉRIE', '1'])).toEqual({
        number: '172195',
        series: '1',
      })
    })

    test('series zero is a series, not an absent one', () => {
      expect(read(['NF-e Nº 000.172.195 SÉRIE 000'])).toEqual({ number: '172195', series: '0' })
    })
  })

  describe('OCR noise the engine already produces', () => {
    test.each([
      ['N° 000.172.195'],
      ['No 000.172.195'],
      ['NO. 000.172.195'],
      ['N.º 000.172.195'],
      ['Nº000.172.195'],
      ['Nº: 000.172.195'],
      ['nº 000,172,195'],
      ['Nº 000172195'],
      ['NFe Nº 172.195'],
      ['NF e N 000.172.195'],
    ])('"%s" reads 172195', (line) => {
      expect(read([line])?.number).toBe('172195')
    })

    test.each([['SERIE 1'], ['SÉRIE1'], ['Série: 001'], ['SER1E 1'], ['SERE 1'], ['5ÉRIE 1']])(
      'series label "%s" (edit distance up to 1) reads 1',
      (line) => {
        expect(read(['NF-e Nº 000.172.195', line])).toEqual({ number: '172195', series: '1' })
      },
    )

    test('a number glued to the series after it is not swallowed', () => {
      expect(read(['Nº 000.172.195 SÉRIE 001'])).toEqual({ number: '172195', series: '1' })
      expect(read(['Nº 000.172.195SÉRIE 001'])).toEqual({ number: '172195', series: '1' })
    })
  })

  describe('without an anchor there is no reading (D3: no false alarm)', () => {
    test('loose digits with no label are not a number', () => {
      expect(read(['RECEBEMOS DE TRANSPORTES EXEMPLO LTDA', '17234', '22/11/2026'])).toBeNull()
    })

    test('empty input and blank lines read nothing', () => {
      expect(read([])).toBeNull()
      expect(read(['', '   '])).toBeNull()
    })

    test('a series without a number reads nothing (series needs number)', () => {
      expect(read(['SÉRIE 001', 'DATA DE RECEBIMENTO'])).toBeNull()
    })

    test('a label with no digits after it reads nothing', () => {
      expect(read(['NF-e', 'Nº', 'SÉRIE 001'])).toBeNull()
    })

    test('an all-zero or too short number is not a number', () => {
      expect(read(['Nº 000.000.000'])).toBeNull()
      expect(read(['Nº 12'])).toBeNull()
    })

    test('more than nine digits is not an NF-e number (nNF has at most 9)', () => {
      expect(read(['Nº 1234567890'])).toBeNull()
    })

    test('a word that merely starts with N is not the label', () => {
      expect(read(['NOVO 172195', 'NUMEROS 172195'])).toBeNull()
    })
  })

  describe('two labels (spec 344: only "Nº"/"NF-e" of the invoice counts)', () => {
    test('Nº of another document (pedido, CT-e, fatura, CEP...) is not the invoice number', () => {
      expect(read(['PEDIDO Nº 4567'])).toBeNull()
      expect(read(['CT-e Nº 000.004.567'])).toBeNull()
      expect(read(['FATURA Nº 4567', 'ORDEM DE COMPRA Nº 99881'])).toBeNull()
    })

    test('the invoice number wins over the Nº of another document', () => {
      expect(read(['PEDIDO Nº 4567', 'NF-e Nº 000.172.195 SÉRIE 1'])).toEqual({
        number: '172195',
        series: '1',
      })
    })

    test('the same number anchored twice (stub and DANFE header) is one reading', () => {
      expect(read([...STUB_LINES, 'DANFE', 'NF-e Nº 000.172.195 SÉRIE 001 FOLHA 1/1'])).toEqual({
        number: '172195',
        series: '1',
      })
    })

    test('the NF-e anchored number wins over a loose Nº (street number on a full DANFE)', () => {
      expect(read(['RUA DAS FLORES, Nº 1234', 'NF-e', 'Nº 000.172.195', 'SÉRIE 001'])).toEqual({
        number: '172195',
        series: '1',
      })
    })

    test('two loose Nº that disagree are ambiguous: nothing', () => {
      expect(read(['RUA DAS FLORES, Nº 1234', 'Nº 000.172.195'])).toBeNull()
    })

    test('two NF-e anchored numbers that disagree are ambiguous: nothing', () => {
      expect(read(['NF-e Nº 000.172.195', 'NF-e Nº 000.931.988'])).toBeNull()
    })

    test('two series that disagree leave the series unread, the number stands', () => {
      expect(read(['NF-e Nº 000.172.195', 'SÉRIE 001', 'SÉRIE 002'])).toEqual({
        number: '172195',
        series: null,
      })
    })
  })

  describe('never returns the recognized text (ADR-0113 §5.3)', () => {
    test('the result has only number and series, and both are digits', () => {
      const identity = read([...STUB_LINES, 'JOSÉ DA SILVA 123.456.789-00'])
      expect(identity).not.toBeNull()
      expect(Object.keys(identity ?? {}).sort()).toEqual(['number', 'series'])
      expect(identity?.number).toMatch(/^[1-9]\d{0,8}$/u)
      expect(identity?.series).toMatch(/^\d{1,3}$/u)
    })

    test('the result is frozen: callers cannot attach text to it', () => {
      const identity = read(STUB_LINES)
      expect(Object.isFrozen(identity)).toBe(true)
    })

    test('nothing of the stub other than the digits leaks into the result', () => {
      const serialized = JSON.stringify(read(STUB_LINES))
      for (const word of ['RECEBEMOS', 'TRANSPORTES', 'ASSINATURA', 'NF', 'SERIE', 'SÉRIE']) {
        expect(serialized).not.toContain(word)
      }
    })
  })
})
