/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.7 (RF8, RF9, RF10): as linhas que o modelo de e-mail recebe, montadas do que o registro
 * gravou (quantidade, unidade, valor unitário copiado, valor pago) e do que a nota diz (descrição,
 * quantidade da NF-e, `vProd`). Nada aqui lê banco: a leitura de `readOccurrenceTemplateValues` só
 * entrega estas duas listas à política.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildOccurrenceTemplateLines,
  type OccurrenceTemplateNfeProduct,
  type StoredOccurrenceLine,
} from '../../src/trips/domain/occurrence-template-lines.policy.js'

function nfe(overrides: Partial<OccurrenceTemplateNfeProduct>): OccurrenceTemplateNfeProduct {
  return {
    code: 'P1',
    commercialUnit: 'CX',
    description: 'Biscoito',
    ordinal: 1,
    quantity: '3.0000',
    totalValue: '59.9850',
    unitValue: '19.9950',
    ...overrides,
  }
}

function stored(overrides: Partial<StoredOccurrenceLine>): StoredOccurrenceLine {
  return {
    declaredAmount: null,
    position: 1,
    productCode: 'P1',
    quantity: '1.000',
    quantityUnit: 'CX',
    unitValue: '19.9950',
    ...overrides,
  }
}

describe('as linhas do modelo de e-mail vêm do registro e da nota (spec 247 T4.7)', () => {
  test('a quantidade, a unidade, o valor unitário e o valor pago são os do registro', () => {
    const [line] = buildOccurrenceTemplateLines({
      nfeProducts: [nfe({ unitValue: '99.0000' })],
      productCodes: [],
      storedLines: [
        stored({
          declaredAmount: '50.0000',
          quantity: '2.500',
          quantityUnit: 'KG',
          unitValue: '19.9950',
        }),
      ],
    })

    expect(line).toEqual({
      code: 'P1',
      declaredAmount: '50.0000',
      description: 'Biscoito',
      nfeQuantity: '3.0000',
      quantity: '2.500',
      totalValue: '59.9850',
      unit: 'KG',
      unitValue: '19.9950',
    })
  })

  test('a ordem é a da marcação (position), não a da nota', () => {
    const lines = buildOccurrenceTemplateLines({
      nfeProducts: [
        nfe({ code: 'P1', ordinal: 1 }),
        nfe({ code: 'P2', description: 'Bolo', ordinal: 2 }),
      ],
      productCodes: [],
      storedLines: [
        stored({ position: 2, productCode: 'P1' }),
        stored({ position: 1, productCode: 'P2' }),
      ],
    })

    expect(lines.map((line) => line.code)).toEqual(['P2', 'P1'])
  })

  test('linha inteira (sem quantidade) leva a unidade e o preço da nota, e vale o vProd somado do código', () => {
    const [line] = buildOccurrenceTemplateLines({
      nfeProducts: [
        nfe({
          code: 'P3',
          commercialUnit: 'FD',
          ordinal: 3,
          quantity: '1.0000',
          totalValue: '10.0000',
          unitValue: '10.0000',
        }),
        nfe({
          code: 'P3',
          commercialUnit: 'FD',
          ordinal: 4,
          quantity: '1.0000',
          totalValue: '12.0000',
          unitValue: '12.0000',
        }),
      ],
      productCodes: [],
      storedLines: [
        stored({ productCode: 'P3', quantity: null, quantityUnit: null, unitValue: null }),
      ],
    })

    expect(line).toMatchObject({
      nfeQuantity: '2.0000',
      quantity: null,
      totalValue: '22.0000',
      unit: 'FD',
      unitValue: '10.0000',
    })
  })

  test('sem linha gravada (ocorrência antiga, galpão), os códigos marcados viram linhas inteiras da nota', () => {
    const lines = buildOccurrenceTemplateLines({
      nfeProducts: [nfe({})],
      productCodes: [' P1 '],
      storedLines: [],
    })

    expect(lines).toEqual([
      {
        code: 'P1',
        declaredAmount: null,
        description: 'Biscoito',
        nfeQuantity: '3.0000',
        quantity: null,
        totalValue: '59.9850',
        unit: 'CX',
        unitValue: '19.9950',
      },
    ])
  })

  test('as linhas gravadas valem no lugar dos códigos; código fora da nota é omitido, nunca inventado', () => {
    const lines = buildOccurrenceTemplateLines({
      nfeProducts: [nfe({})],
      productCodes: ['P1', 'P2'],
      storedLines: [
        stored({ position: 1, productCode: 'P1' }),
        stored({ position: 2, productCode: 'FORA' }),
      ],
    })

    expect(lines.map((line) => line.code)).toEqual(['P1'])
  })

  test('nota sem produto e ocorrência da nota inteira não têm linha', () => {
    expect(
      buildOccurrenceTemplateLines({ nfeProducts: [], productCodes: ['P1'], storedLines: [] }),
    ).toEqual([])
    expect(
      buildOccurrenceTemplateLines({ nfeProducts: [nfe({})], productCodes: [], storedLines: [] }),
    ).toEqual([])
  })
})
