/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4 (RF13): a correção manda o número e os valores em três estados — ausente mantém o gravado,
 * nulo limpa, texto vale — e nunca o valor da ocorrência junto do valor de linha. Dinheiro sempre texto.
 */
import { describe, expect, test } from 'bun:test'

import {
  EMPTY_CORRECTION_AMOUNTS_DRAFT,
  isValidReferenceNumber,
  resolveCorrectionAmounts,
  type CorrectionAmountsDraft,
} from '@/modules/trip/shared/occurrenceCorrectionAmounts.service'
import { buildOccurrenceCorrectionItems } from '@/modules/trip/shared/occurrenceProductSelection.service'

function draft(overrides: Partial<CorrectionAmountsDraft>): CorrectionAmountsDraft {
  return { ...EMPTY_CORRECTION_AMOUNTS_DRAFT, ...overrides }
}

describe('o número do documento do cliente (RF14: [A-Za-z0-9 ./-], até 30)', () => {
  test('o que a API aceita', () => {
    for (const text of ['45029', 'NFD 45029', 'A.1/2-3', 'x'.repeat(30)]) {
      expect(isValidReferenceNumber(text)).toBe(true)
    }
  })

  test('o que a API recusa: vazio, 31 caracteres, símbolo, acento', () => {
    for (const text of ['', 'x'.repeat(31), 'NFD#1', 'NFD_1', 'NFD é', 'a;b']) {
      expect(isValidReferenceNumber(text)).toBe(false)
    }
  })
})

describe('três estados: ausente mantém, nulo limpa, texto vale', () => {
  test('nada editado: nada vai, e nada é erro', () => {
    const resolved = resolveCorrectionAmounts({
      codes: ['696'],
      draft: EMPTY_CORRECTION_AMOUNTS_DRAFT,
    })
    expect(resolved).toEqual({ hasReferenceNumberError: false, lineAmounts: new Map() })
    expect(resolved).not.toHaveProperty('referenceNumber')
    expect(resolved).not.toHaveProperty('declaredAmount')
  })

  test('número digitado vale aparado; apagado vira nulo; inválido é erro e não vai', () => {
    expect(
      resolveCorrectionAmounts({ codes: [], draft: draft({ referenceNumber: '  NFD 45029 ' }) })
        .referenceNumber,
    ).toBe('NFD 45029')
    const cleared = resolveCorrectionAmounts({
      codes: [],
      draft: draft({ referenceNumber: '   ' }),
    })
    expect(cleared).toHaveProperty('referenceNumber')
    expect(cleared.referenceNumber).toBeNull()
    const invalid = resolveCorrectionAmounts({
      codes: [],
      draft: draft({ referenceNumber: 'NFD#1' }),
    })
    expect(invalid.hasReferenceNumberError).toBe(true)
    expect(invalid).not.toHaveProperty('referenceNumber')
  })

  test('valor por linha: o campo mascarado vira texto decimal; vazio limpa; zero é valor', () => {
    const resolved = resolveCorrectionAmounts({
      codes: ['696', '697', '698'],
      draft: draft({
        lineAmounts: new Map([
          ['696', '1.234,50'],
          ['697', ''],
          ['698', '0,00'],
        ]),
      }),
    })
    expect(resolved.lineAmounts).toEqual(
      new Map<string, null | string>([
        ['696', '1234.50'],
        ['697', null],
        ['698', '0.00'],
      ]),
    )
    expect(resolved).not.toHaveProperty('declaredAmount')
  })

  test('valor de linha de código que saiu da seleção não vai', () => {
    const resolved = resolveCorrectionAmounts({
      codes: ['696'],
      draft: draft({ lineAmounts: new Map([['999', '10,00']]) }),
    })
    expect(resolved.lineAmounts.size).toBe(0)
  })

  test('valor da ocorrência: texto vale, vazio limpa, e some quando o escopo é por linha', () => {
    const occurrence = draft({ occurrenceAmount: '199,99', scope: 'occurrence' })
    expect(resolveCorrectionAmounts({ codes: ['696'], draft: occurrence }).declaredAmount).toBe(
      '199.99',
    )
    const cleared = resolveCorrectionAmounts({
      codes: [],
      draft: draft({ occurrenceAmount: '', scope: 'occurrence' }),
    })
    expect(cleared).toHaveProperty('declaredAmount')
    expect(cleared.declaredAmount).toBeNull()

    const byLine = resolveCorrectionAmounts({
      codes: ['696'],
      draft: draft({ occurrenceAmount: '199,99', scope: 'item' }),
    })
    expect(byLine).not.toHaveProperty('declaredAmount')
  })

  test('valor de linha digitado some quando o escopo é a ocorrência (nunca os dois níveis: 400)', () => {
    const resolved = resolveCorrectionAmounts({
      codes: ['696'],
      draft: draft({ lineAmounts: new Map([['696', '10,00']]), scope: 'occurrence' }),
    })
    expect(resolved.lineAmounts.size).toBe(0)
  })
})

describe('o corpo da correção leva o valor só nas linhas editadas', () => {
  test('sem valor editado o corpo é o de sempre', () => {
    expect(buildOccurrenceCorrectionItems({ codes: ['696'], quantitiesByCode: new Map() })).toEqual(
      [{ code: '696' }],
    )
  })

  test('declaredAmount entra na linha: texto, nulo, ausente', () => {
    const items = buildOccurrenceCorrectionItems({
      codes: ['696', '697', '698'],
      declaredAmounts: new Map<string, null | string>([
        ['696', '50.00'],
        ['697', null],
      ]),
      quantitiesByCode: new Map([['696', { quantity: '1', unit: 'CX' }]]),
    })
    expect(items).toEqual([
      { code: '696', declaredAmount: '50.00', quantity: '1', unit: 'CX' },
      { code: '697', declaredAmount: null },
      { code: '698' },
    ])
    expect(items[2]).not.toHaveProperty('declaredAmount')
  })
})
