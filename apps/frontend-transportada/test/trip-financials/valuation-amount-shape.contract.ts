/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { formatAmount } from '../../src/modules/shared/decimalAmount.service'
import { toTripValuation } from '../../src/modules/trip-financials/shared/tripValuationResponse.validation'

const PARCEL = {
  amount: '120.0000',
  basis: null,
  detail: null,
  gap: null,
  kind: 'fuel',
  source: 'estimated',
} as const

const LINE = {
  amount: '2000.0000',
  freightRuleId: null,
  freightRuleName: null,
  gap: null,
  nfeDocumentId: null,
  percentage: null,
  source: 'measured',
  tripDocumentId: 'doc-1',
} as const

function response(input: Readonly<Record<string, unknown>> = {}): unknown {
  return {
    data: {
      costParcels: [PARCEL],
      hasGaps: false,
      marginPercentage: null,
      revenueLines: [LINE],
      revenueSource: 'estimated',
      totalCost: '120.0000',
      totalMargin: '1880.0000',
      totalRevenue: '2000.0000',
      ...input,
    },
  }
}

/** A recusa vale para os dois lados da conta: custo e receita leem dinheiro pela mesma régua. */
function expectRejectedOnBothSides(amount: unknown): void {
  expect(toTripValuation(response({ costParcels: [{ ...PARCEL, amount }] }))).toBeNull()
  expect(toTripValuation(response({ revenueLines: [{ ...LINE, amount }] }))).toBeNull()
}

/** Texto que não é decimal da escala fiscal: `formatAmount` recusa cada um com `INVALID_AMOUNT`. */
const MALFORMED_MONEY_TEXTS: readonly string[] = ['', '1.00000', 'muito caro', '1,00', '1.', '-']

/**
 * A avaliação prevista é conta de apoio, e o validador já diz isso: corpo malformado vira
 * **ausência**, não exceção. Só que dinheiro escapava da regra — `readText` devolvia `''` para
 * `amount` fora de forma, a linha atravessava calada e `formatAmount` lançava `INVALID_AMOUNT` na
 * renderização. A borda que existe para não derrubar a tela da viagem derrubava a tela da viagem.
 */
describe('dinheiro fora de forma é recusado na fronteira, não na tela', () => {
  test('o caminho feliz continua atravessando inteiro', () => {
    const valuation = toTripValuation(response())

    expect(valuation?.costParcels[0]?.amount).toBe('120.0000')
    expect(valuation?.revenueLines[0]?.amount).toBe('2000.0000')
  })

  /**
   * ⚠️ O teto de quatro casas não é escolha desta guarda: é a escala fiscal do repositório
   * (`AMOUNT_MAX_SCALE`), e o formatador lança acima dela. O padrão da borda é exatamente o
   * conjunto que a renderização aceita — provado aqui pelo próprio `formatAmount`.
   */
  test.each([...MALFORMED_MONEY_TEXTS])('o formatador recusa %p na renderização', (amount) => {
    expect(() => formatAmount(amount)).toThrow('INVALID_AMOUNT')
  })

  test.each([...MALFORMED_MONEY_TEXTS])('a avaliação com %p é recusada na fronteira', (amount) => {
    expectRejectedOnBothSides(amount)
  })

  /**
   * ⚠️ Não-string é caso **próprio**, e é por isso que `readMoney` confere o tipo **antes** do
   * padrão: `AMOUNT_PATTERN.test(12.5)` coage o número para `'12.5'` e **passa**, e o estouro vem
   * depois, em `value.replace`, como `TypeError` — nem o código de erro do domínio a tela recebe.
   *
   * Cada forma é um teste escrito à mão de propósito: `test.each` **espalha** elemento que é array,
   * e `[['1.00']]` chegaria ao corpo como a string válida `'1.00'`, verde sem ter medido nada.
   */
  test('número não é dinheiro, mesmo atravessando o padrão por coerção', () => {
    expect(() => formatAmount(12.5 as unknown as string)).toThrow()
    expectRejectedOnBothSides(12.5)
  })

  test('nulo não é dinheiro', () => {
    expectRejectedOnBothSides(null)
  })

  test('booleano não é dinheiro', () => {
    expectRejectedOnBothSides(true)
  })

  test('objeto não é dinheiro', () => {
    expectRejectedOnBothSides({ value: '1.00' })
  })

  test('array com um decimal dentro não é dinheiro', () => {
    expectRejectedOnBothSides(['1.00'])
  })

  /** Campo ausente é o mesmo caso: `undefined` não é decimal, e a avaliação inteira não vale. */
  test('parcela sem o campo não atravessa como zero', () => {
    expect(toTripValuation(response({ costParcels: [{ gap: null, kind: 'fuel' }] }))).toBeNull()
    expect(toTripValuation(response({ revenueLines: [{ tripDocumentId: 'doc-1' }] }))).toBeNull()
  })

  /**
   * A recusa é do **lote**, não da linha: descartar a parcela fora de forma e manter as outras
   * faria o total somar o que a tela não lista, que é mentir com número certo ao lado.
   */
  test('uma parcela fora de forma invalida o lote inteiro', () => {
    expect(
      toTripValuation(response({ costParcels: [PARCEL, { ...PARCEL, amount: '' }] })),
    ).toBeNull()
    expect(toTripValuation(response({ revenueLines: [LINE, { ...LINE, amount: '' }] }))).toBeNull()
  })

  /** Negativo e sem casas são dinheiro legítimo — a margem da viagem no prejuízo é negativa. */
  test('negativo e inteiro continuam passando', () => {
    const valuation = toTripValuation(
      response({
        costParcels: [
          { ...PARCEL, amount: '-120.5' },
          { ...PARCEL, amount: '7' },
        ],
      }),
    )

    expect(valuation?.costParcels.map((parcel) => parcel.amount)).toEqual(['-120.5', '7'])
  })
})
