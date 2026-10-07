/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4 (RF12, D11): o acerto da tratativa (164) sugere o valor de cada item a partir do registro —
 * o pago digitado, senão a soma da linha. Linha com valor pago zero **não** gera sugestão (a loja não pagou:
 * sem valor a acertar), e a 164 exige `amount > 0`, então 0 nunca é preenchido. Nenhuma regra da 164 muda.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildSettlementSuggestion,
  buildSettlementSuggestionLines,
  type SettlementSuggestionLine,
} from '@/modules/trip/shared/occurrenceSettlementSuggestion.service'
import type { TripDocumentProduct } from '@/modules/trip/shared/trip.types'
import type {
  TripOccurrenceDetailItem,
  TripOccurrenceItemValue,
} from '@/modules/trip/shared/tripOccurrenceFeed.service'

function line(overrides: Partial<SettlementSuggestionLine>): SettlementSuggestionLine {
  return {
    code: '696',
    declaredAmount: undefined,
    quantity: '1.000',
    totalValue: '57.2000',
    unitValue: '57.2000',
    ...overrides,
  }
}

describe('o valor sugerido de cada item (RF12)', () => {
  test('sem valor pago digitado, vale a soma da linha, com origem da nota', () => {
    const suggestion = buildSettlementSuggestion([line({})])
    expect(suggestion.rows).toEqual([
      {
        amount: '57.20',
        amountCents: 5720n,
        amountSource: 'nfe',
        productCode: '696',
        referenceCents: 5720n,
      },
    ])
    expect(suggestion.unpaid).toEqual([])
  })

  test('o valor pago digitado vence, com origem manual, e a soma segue como referência', () => {
    const suggestion = buildSettlementSuggestion([line({ declaredAmount: '50.0000' })])
    expect(suggestion.rows).toEqual([
      {
        amount: '50.00',
        amountCents: 5000n,
        amountSource: 'manual',
        productCode: '696',
        referenceCents: 5720n,
      },
    ])
  })

  test('valor pago zero: a loja não pagou — sem sugestão, nunca preenchido com 0, soma visível', () => {
    const suggestion = buildSettlementSuggestion([
      line({ declaredAmount: '0.0000' }),
      line({ code: '697' }),
    ])
    expect(suggestion.rows.map((row) => row.productCode)).toEqual(['697'])
    expect(suggestion.unpaid).toEqual([{ productCode: '696', referenceCents: 5720n }])
    for (const row of suggestion.rows) expect(row.amount).not.toBe('0.00')
  })

  test('quantidade nula: a linha inteira vale o vProd da nota, arredondado', () => {
    const suggestion = buildSettlementSuggestion([
      line({ quantity: null, totalValue: '12.3450', unitValue: '4.1150' }),
    ])
    expect(suggestion.rows[0]?.amount).toBe('12.35')
  })

  test('sem dado da nota nem valor pago, não há o que sugerir (a tela não inventa)', () => {
    const suggestion = buildSettlementSuggestion([line({ totalValue: null, unitValue: null })])
    expect(suggestion.rows).toEqual([])
    expect(suggestion.unpaid).toEqual([])
  })

  test('soma zero (quantidade zero) não vira sugestão de 0', () => {
    const suggestion = buildSettlementSuggestion([line({ quantity: '0.000' })])
    expect(suggestion.rows).toEqual([])
  })

  test('a conta é em inteiro: 3 × 19,995 sugere 59,99', () => {
    const suggestion = buildSettlementSuggestion([
      line({ quantity: '3.000', totalValue: '59.9850', unitValue: '19.9950' }),
    ])
    expect(suggestion.rows[0]?.amount).toBe('59.99')
  })

  test('ordem da ocorrência preservada', () => {
    const suggestion = buildSettlementSuggestion([line({ code: 'B' }), line({ code: 'A' })])
    expect(suggestion.rows.map((row) => row.productCode)).toEqual(['B', 'A'])
  })
})

/**
 * Spec 247 T7.2 (M3, D9): a sugestão parte do que o registro **copiou** (`unitValue` do detalhe), soma todas as
 * linhas do mesmo código, deixa o valor pago (linha ou ocorrência) vencer a soma e nunca preenche com zero.
 */
function product(overrides: Partial<TripDocumentProduct>): TripDocumentProduct {
  return {
    code: 'P1',
    commercialUnit: 'CX',
    description: 'Produto',
    ordinal: 1,
    quantity: '10.000',
    totalValue: '999.00',
    unitValue: '25.0000',
    ...overrides,
  }
}

function item(overrides: Partial<TripOccurrenceDetailItem>): TripOccurrenceDetailItem {
  return { code: 'P1', description: 'Produto', quantity: '3.000', unit: 'CX', ...overrides }
}

function value(overrides: Partial<TripOccurrenceItemValue>): TripOccurrenceItemValue {
  return {
    declaredAmount: null,
    productCode: 'P1',
    quantity: '3.000',
    unitValue: '19.9950',
    ...overrides,
  }
}

type Case = Readonly<{
  expectedRows: readonly (readonly [code: string, amount: string, source: 'manual' | 'nfe'])[]
  expectedUnpaid: readonly string[]
  items: readonly TripOccurrenceDetailItem[]
  itemValues: readonly TripOccurrenceItemValue[] | undefined
  name: string
}>

const CASES: readonly Case[] = [
  {
    expectedRows: [['P1', '59.99', 'nfe']],
    expectedUnpaid: [],
    items: [item({})],
    itemValues: [value({})],
    name: '3 × 19,995 sobre o valor copiado, e não sobre o preço atual da nota (25,00)',
  },
  {
    expectedRows: [['P1', '30.00', 'nfe']],
    expectedUnpaid: [],
    items: [item({ quantity: '1.000' }), item({ quantity: '2.000' })],
    itemValues: [
      value({ quantity: '1.000', unitValue: '10.0000' }),
      value({ quantity: '2.000', unitValue: '10.0000' }),
    ],
    name: 'código repetido em 2 linhas: soma das duas, e não só a primeira',
  },
  {
    expectedRows: [['P1', '25.00', 'manual']],
    expectedUnpaid: [],
    items: [item({ quantity: '1.000' }), item({ quantity: '2.000' })],
    itemValues: [
      value({ declaredAmount: '5.00', quantity: '1.000', unitValue: '10.0000' }),
      value({ quantity: '2.000', unitValue: '10.0000' }),
    ],
    name: 'código repetido, uma linha com valor pago: o pago vale no lugar da soma só daquela linha',
  },
  {
    expectedRows: [['P1', '50.00', 'manual']],
    expectedUnpaid: [],
    items: [item({})],
    itemValues: [value({ declaredAmount: '50.00' })],
    name: 'o valor pago da linha vence a soma',
  },
  {
    expectedRows: [],
    expectedUnpaid: ['P1'],
    items: [item({})],
    itemValues: [value({ declaredAmount: '0.00' })],
    name: 'valor pago 0: a loja não pagou, sem sugestão',
  },
  {
    expectedRows: [['P1', '25.00', 'nfe']],
    expectedUnpaid: [],
    items: [item({ quantity: '1.000' })],
    itemValues: undefined,
    name: 'ocorrência antiga, sem itemValues: cai no preço atual da nota, sem erro',
  },
  {
    expectedRows: [['P1', '25.00', 'nfe']],
    expectedUnpaid: [],
    items: [item({ quantity: '1.000' })],
    itemValues: [value({ productCode: 'OUTRO', quantity: '1.000', unitValue: '10.0000' })],
    name: 'itemValues que não casa com o item (código diferente): ignorado, cai na nota',
  },
]

describe('a sugestão parte do valor copiado no registro (M3)', () => {
  for (const testCase of CASES) {
    test(testCase.name, () => {
      const suggestion = buildSettlementSuggestion(
        buildSettlementSuggestionLines({
          items: testCase.items,
          ...(testCase.itemValues === undefined ? {} : { itemValues: testCase.itemValues }),
          products: [product({})],
        }),
      )
      expect(suggestion.rows.map((row) => [row.productCode, row.amount, row.amountSource])).toEqual(
        testCase.expectedRows.map((row) => [...row]),
      )
      expect(suggestion.unpaid.map((entry) => entry.productCode)).toEqual([
        ...testCase.expectedUnpaid,
      ])
      for (const row of suggestion.rows) expect(row.amount).not.toBe('0.00')
    })
  }
})

describe('o valor pago de escopo ocorrência na sugestão (M3)', () => {
  const lines = (codes: readonly string[]) =>
    codes.map((code) =>
      line({ code, quantity: '1.000', totalValue: '10.00', unitValue: '10.0000' }),
    )

  test('um só código: o valor da ocorrência vira o sugerido, manual, com a soma como referência', () => {
    const suggestion = buildSettlementSuggestion(lines(['A']), { occurrenceAmount: '40.00' })
    expect(suggestion.rows).toEqual([
      {
        amount: '40.00',
        amountCents: 4000n,
        amountSource: 'manual',
        productCode: 'A',
        referenceCents: 1000n,
      },
    ])
    expect(suggestion.unsplitAmountCents).toBeNull()
  })

  test('vários códigos: não há como atribuir o valor a um item, então não inventa linhas', () => {
    const suggestion = buildSettlementSuggestion(lines(['A', 'B']), { occurrenceAmount: '40.00' })
    expect(suggestion.rows).toEqual([])
    expect(suggestion.unsplitAmountCents).toBe(4000n)
  })

  test('valor da ocorrência zero: a loja não pagou nenhum item, e nada é preenchido', () => {
    const suggestion = buildSettlementSuggestion(lines(['A', 'B']), { occurrenceAmount: '0.00' })
    expect(suggestion.rows).toEqual([])
    expect(suggestion.unpaid.map((entry) => entry.productCode)).toEqual(['A', 'B'])
    expect(suggestion.unsplitAmountCents).toBeNull()
  })

  test('sem valor da ocorrência, tudo como antes', () => {
    const suggestion = buildSettlementSuggestion(lines(['A', 'B']), { occurrenceAmount: null })
    expect(suggestion.rows.map((row) => row.amount)).toEqual(['10.00', '10.00'])
  })
})
