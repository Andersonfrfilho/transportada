/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  formatOccurrenceProductLabel,
  OCCURRENCE_WHOLE_DOCUMENT_VALUE,
  resolveOccurrenceProductCodes,
  resolveOccurrenceProductSelection,
  resolveOccurrenceProductSelectionValues,
} from '@/modules/trip/shared/occurrenceProductSelection.service'
import { isTripOccurrence } from '@/modules/trip/shared/tripResponse.validation'

const WHOLE = OCCURRENCE_WHOLE_DOCUMENT_VALUE

describe('"a nota inteira" é o padrão e é exclusiva', () => {
  test('sem item escolhido, o campo mostra a nota inteira marcada', () => {
    expect(resolveOccurrenceProductSelectionValues([])).toEqual([WHOLE])
  })

  test('com itens escolhidos, a nota inteira não aparece marcada', () => {
    expect(resolveOccurrenceProductSelectionValues(['A1', 'B2'])).toEqual(['A1', 'B2'])
  })

  test('marcar a nota inteira desmarca os itens', () => {
    expect(
      resolveOccurrenceProductSelection({ next: ['A1', 'B2', WHOLE], previous: ['A1', 'B2'] }),
    ).toEqual([])
  })

  test('marcar um item desmarca a nota inteira', () => {
    expect(resolveOccurrenceProductSelection({ next: [WHOLE, 'A1'], previous: [WHOLE] })).toEqual([
      'A1',
    ])
  })

  test('desmarcar o último item volta sozinho para a nota inteira', () => {
    const selecionados = resolveOccurrenceProductSelection({ next: [], previous: ['A1'] })

    expect(selecionados).toEqual([])
    expect(resolveOccurrenceProductSelectionValues(selecionados)).toEqual([WHOLE])
  })
})

describe('vários itens na mesma ocorrência', () => {
  test('marcar o segundo item mantém o primeiro', () => {
    expect(resolveOccurrenceProductSelection({ next: ['A1', 'B2'], previous: ['A1'] })).toEqual([
      'A1',
      'B2',
    ])
  })

  test('a listagem imprime todos os itens marcados, não só o primeiro', () => {
    expect(
      formatOccurrenceProductLabel({
        codes: ['A1', 'B2', 'C3'],
        wholeDocumentLabel: 'A nota inteira',
      }),
    ).toBe('A1, B2, C3')
  })

  test('lista vazia imprime a nota inteira', () => {
    expect(formatOccurrenceProductLabel({ codes: [], wholeDocumentLabel: 'A nota inteira' })).toBe(
      'A nota inteira',
    )
  })
})

describe('a leitura aceita o contrato novo e o antigo', () => {
  const base = {
    createdAt: '2026-09-22T12:00:00.000Z',
    id: 'occurrence-1',
    note: '',
    occurrenceTypeId: 'type-1',
    stage: 'separation' as const,
    typeName: 'Item avariado',
  }

  test('`productCodes` é o que vale quando vem', () => {
    expect(
      resolveOccurrenceProductCodes({ productCode: 'A1', productCodes: ['A1', 'B2'] }),
    ).toEqual(['A1', 'B2'])
  })

  test('sem `productCodes` (resposta antiga), o `productCode` continua sendo lido', () => {
    expect(resolveOccurrenceProductCodes({ productCode: 'A1' })).toEqual(['A1'])
  })

  test('`productCode` vazio sem `productCodes` é a nota inteira', () => {
    expect(resolveOccurrenceProductCodes({ productCode: '' })).toEqual([])
  })

  test('`productCodes` vazio é a nota inteira, mesmo com `productCode` preenchido', () => {
    expect(resolveOccurrenceProductCodes({ productCode: 'A1', productCodes: [] })).toEqual([])
  })

  /**
   * A guarda é de chave exata: campo novo na resposta é mudança de contrato, e foi assim que a
   * grade de fotos quebrou antes.
   */
  test('a guarda aceita a ocorrência com `productCodes`', () => {
    expect(isTripOccurrence({ ...base, productCode: 'A1', productCodes: ['A1', 'B2'] })).toBe(true)
  })

  test('a guarda continua aceitando a ocorrência sem `productCodes`', () => {
    expect(isTripOccurrence({ ...base, productCode: 'A1' })).toBe(true)
  })

  test('`productCodes` que não é lista de texto é recusado', () => {
    expect(isTripOccurrence({ ...base, productCode: '', productCodes: [1] })).toBe(false)
    expect(isTripOccurrence({ ...base, productCode: '', productCodes: 'A1' })).toBe(false)
  })
})
