/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 166 T202: quanto de cada item marcado foi atingido — par casado, zero/negativo, unidade
 * desconhecida, listas desalinhadas.
 *
 * Spec 172: a unidade aceita para cada item deixa de ser só `unit`/`box` — passa a aceitar também
 * a unidade comercial *daquele item específico* na nota.
 */
import { describe, expect, test } from 'bun:test'

import { resolveOccurrenceItemQuantities } from '../../src/trips/domain/occurrence-item-quantity.policy.js'

function recusaDe(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as { readonly code: string }).code
  }
  throw new Error('esperava recusa, e nada foi lançado')
}

describe('a quantidade por item é opcional, e sempre alinhada por índice', () => {
  test('sem nenhuma quantidade enviada, todos os itens saem sem contagem', () => {
    expect(
      resolveOccurrenceItemQuantities({
        productCodes: ['ZG-4410', 'ZG-4411'],
        quantities: [],
        units: [],
      }),
    ).toEqual([
      { code: 'ZG-4410', quantity: null, unit: null },
      { code: 'ZG-4411', quantity: null, unit: null },
    ])
  })

  test('item com quantidade e unidade preenche os dois', () => {
    expect(
      resolveOccurrenceItemQuantities({
        productCodes: ['ZG-4410'],
        quantities: ['3.5'],
        units: ['box'],
      }),
    ).toEqual([{ code: 'ZG-4410', quantity: '3.5', unit: 'box' }])
  })

  test('branco na posição deixa o item sem contagem, mesmo com outros preenchidos', () => {
    expect(
      resolveOccurrenceItemQuantities({
        productCodes: ['ZG-4410', 'ZG-4411'],
        quantities: ['2', ''],
        units: ['unit', ''],
      }),
    ).toEqual([
      { code: 'ZG-4410', quantity: '2', unit: 'unit' },
      { code: 'ZG-4411', quantity: null, unit: null },
    ])
  })

  test('quantidade sem unidade é recusada', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: ['ZG-4410'],
          quantities: ['2'],
          units: [''],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_UNIT_PAIRING')
  })

  test('unidade sem quantidade é recusada', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: ['ZG-4410'],
          quantities: [''],
          units: ['box'],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_UNIT_PAIRING')
  })

  test('zero é recusado — zero é "não aconteceu"', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: ['ZG-4410'],
          quantities: ['0'],
          units: ['unit'],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE')
  })

  test('negativo é recusado', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: ['ZG-4410'],
          quantities: ['-1'],
          units: ['unit'],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE')
  })

  test('texto que não é número é recusado', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: ['ZG-4410'],
          quantities: ['abc'],
          units: ['unit'],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE')
  })

  test('unidade desconhecida é recusada, nunca cai em "unit" por padrão', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: ['ZG-4410'],
          quantities: ['2'],
          units: ['pallet'],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_UNIT_UNKNOWN')
  })

  test('lista de quantidades menor que a de itens é recusada', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: ['ZG-4410', 'ZG-4411'],
          quantities: ['2'],
          units: [],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_LENGTH_MISMATCH')
  })

  test('lista de unidades maior que a de itens é recusada', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: ['ZG-4410'],
          quantities: ['2'],
          units: ['unit', 'box'],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_LENGTH_MISMATCH')
  })

  test('nota inteira (sem item) com quantidade enviada é recusada por desalinhamento', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: [],
          quantities: ['2'],
          units: ['unit'],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_LENGTH_MISMATCH')
  })
})

describe('a unidade também aceita a unidade comercial do próprio item (spec 172 RF2/RF3)', () => {
  test('unidade igual à unidade comercial do item é aceita', () => {
    expect(
      resolveOccurrenceItemQuantities({
        productCodes: ['ZG-4410'],
        products: [{ code: 'ZG-4410', commercialUnit: 'KG' }],
        quantities: ['2.5'],
        units: ['KG'],
      }),
    ).toEqual([{ code: 'ZG-4410', quantity: '2.5', unit: 'KG' }])
  })

  test('unit/box continuam aceitos mesmo quando o item tem unidade comercial própria', () => {
    expect(
      resolveOccurrenceItemQuantities({
        productCodes: ['ZG-4410'],
        products: [{ code: 'ZG-4410', commercialUnit: 'KG' }],
        quantities: ['1'],
        units: ['box'],
      }),
    ).toEqual([{ code: 'ZG-4410', quantity: '1', unit: 'box' }])
  })

  test('unidade de outro item da mesma nota é recusada, nunca aceita por engano', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: ['ZG-4410', 'ZG-4411'],
          products: [
            { code: 'ZG-4410', commercialUnit: 'KG' },
            { code: 'ZG-4411', commercialUnit: 'L' },
          ],
          quantities: ['2', ''],
          units: ['L', ''],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_UNIT_UNKNOWN')
  })

  test('item sem unidade comercial declarada cai no par unit/box de sempre', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: ['ZG-4410'],
          products: [{ code: 'ZG-4410' }],
          quantities: ['2'],
          units: ['KG'],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_UNIT_UNKNOWN')
  })

  test('sem a lista de products (compatibilidade), só unit/box são aceitos', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceItemQuantities({
          productCodes: ['ZG-4410'],
          quantities: ['2'],
          units: ['KG'],
        }),
      ),
    ).toBe('OCCURRENCE_ITEM_QUANTITY_UNIT_UNKNOWN')
  })
})
