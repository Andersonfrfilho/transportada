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
  type SettlementSuggestionLine,
} from '@/modules/trip/shared/occurrenceSettlementSuggestion.service'

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
