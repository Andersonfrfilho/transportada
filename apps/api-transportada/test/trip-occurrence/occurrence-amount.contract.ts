/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T3.1 (CA02): a soma de cada linha da devolução e a soma geral, em inteiro. O e-mail do SAC
 * fecha na conta que o leitor faz com a calculadora; um centavo trocado pelo binário vira disputa de
 * crédito com o cliente.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  calculateItemLineAmount,
  formatBrazilianAmount,
  formatBrazilianQuantity,
  parseAmountToCents,
  resolveOccurrenceAmounts,
} from '../../src/trips/domain/occurrence-amount.policy.js'

const POLICY_SOURCE = readFileSync(
  new URL('../../src/trips/domain/occurrence-amount.policy.ts', import.meta.url),
  'utf8',
)

type LineCase = {
  readonly expectedCents: bigint
  readonly name: string
  readonly quantity: null | string
  readonly totalValue: string
  readonly unitValue: string
}

/** Cada caso é uma linha da NF-e: quantidade devolvida × vUnCom, arredondada a centavos, meio para cima. */
const LINE_CASES: readonly LineCase[] = [
  {
    expectedCents: 5720n,
    name: '1 × 57,20',
    quantity: '1.000',
    totalValue: '57.2000',
    unitValue: '57.2000',
  },
  {
    expectedCents: 83n,
    name: '2,5 × 0,3333 = 0,83325 → 0,83',
    quantity: '2.500',
    totalValue: '0.8333',
    unitValue: '0.3333',
  },
  {
    expectedCents: 5999n,
    name: '3 × 19,995 = 59,985 → 59,99',
    quantity: '3.000',
    totalValue: '59.9850',
    unitValue: '19.9950',
  },
  {
    expectedCents: 101n,
    name: '1 × 1,005 → 1,01 (o binário dá 1,00)',
    quantity: '1.000',
    totalValue: '1.0050',
    unitValue: '1.0050',
  },
  {
    expectedCents: 835n,
    name: '1 × 8,345 → 8,35 (o binário dá 8,34)',
    quantity: '1.000',
    totalValue: '8.3450',
    unitValue: '8.3450',
  },
  {
    expectedCents: 1n,
    name: '1 × 0,005 → 0,01, meio para cima e não truncado',
    quantity: '1.000',
    totalValue: '0.0050',
    unitValue: '0.0050',
  },
  {
    expectedCents: 0n,
    name: '1 × 0,0049 → 0,00',
    quantity: '1.000',
    totalValue: '0.0049',
    unitValue: '0.0049',
  },
  {
    expectedCents: 0n,
    name: 'quantidade zero',
    quantity: '0.000',
    totalValue: '10.0000',
    unitValue: '10.0000',
  },
  {
    expectedCents: 1235n,
    name: 'sem quantidade registrada: vProd da nota, 12,345 → 12,35',
    quantity: null,
    totalValue: '12.3450',
    unitValue: '4.1150',
  },
  {
    expectedCents: 12000n,
    name: 'quantidade com três casas: 0,125 × 960 = 120,00',
    quantity: '0.125',
    totalValue: '960.0000',
    unitValue: '960.0000',
  },
]

describe('a soma da linha é quantidade × valor unitário, em centavos, meio para cima (spec 247 CA02)', () => {
  for (const lineCase of LINE_CASES) {
    test(lineCase.name, () => {
      expect(
        calculateItemLineAmount({
          quantity: lineCase.quantity,
          totalValue: lineCase.totalValue,
          unitValue: lineCase.unitValue,
        }),
      ).toBe(lineCase.expectedCents)
    })
  }
})

describe('o valor monetário lido do banco vira centavos exatos (spec 247 RF9)', () => {
  test('arredonda a quarta casa do numeric, meio para cima', () => {
    expect(parseAmountToCents('57.2000')).toBe(5720n)
    expect(parseAmountToCents('0.0050')).toBe(1n)
    expect(parseAmountToCents('0.0049')).toBe(0n)
    expect(parseAmountToCents('50')).toBe(5000n)
    expect(parseAmountToCents('0.5')).toBe(50n)
  })

  test('um valor além de 2^53 não perde centavo (o binário perderia)', () => {
    expect(parseAmountToCents('99999999999999999.9999')).toBe(10000000000000000000n)
    expect(parseAmountToCents('12345678901234567.8901')).toBe(1234567890123456789n)
  })

  test('texto que não é um decimal sem sinal é recusado, sem repetir o valor', () => {
    for (const refused of ['', 'abc', '-1', '1,5', '1.23456', ' 1', '1e3', '.5']) {
      expect(() => parseAmountToCents(refused)).toThrow(RangeError)
    }
    expect(() => parseAmountToCents('4410,99x')).toThrow(RangeError)
    try {
      parseAmountToCents('4410,99x')
    } catch (error) {
      expect((error as Error).message).not.toContain('4410')
    }
  })
})

describe('a formatação é brasileira, sem símbolo (spec 247 RF7, D4)', () => {
  test('dinheiro: milhar com ponto, centavos com vírgula', () => {
    expect(formatBrazilianAmount(784064n)).toBe('7.840,64')
    expect(formatBrazilianAmount(5720n)).toBe('57,20')
    expect(formatBrazilianAmount(5n)).toBe('0,05')
    expect(formatBrazilianAmount(0n)).toBe('0,00')
    expect(formatBrazilianAmount(123456789n)).toBe('1.234.567,89')
    expect(formatBrazilianAmount(10000000000000000000n)).toBe('100.000.000.000.000.000,00')
  })

  test('quantidade: sem zeros à direita', () => {
    expect(formatBrazilianQuantity('1.000')).toBe('1')
    expect(formatBrazilianQuantity('2.500')).toBe('2,5')
    expect(formatBrazilianQuantity('0.125')).toBe('0,125')
    expect(formatBrazilianQuantity('12')).toBe('12')
    expect(formatBrazilianQuantity('12.0')).toBe('12')
    expect(formatBrazilianQuantity('0.000')).toBe('0')
    expect(formatBrazilianQuantity('1234.5')).toBe('1.234,5')
  })
})

const NOTE_LINE = {
  declaredAmount: null,
  quantity: '1.000',
  totalValue: '57.2000',
  unitValue: '57.2000',
} as const

describe('a soma geral é a das linhas arredondadas, e o valor pago vence (spec 247 RF9)', () => {
  test('a soma geral soma as linhas já arredondadas, nunca antes de arredondar', () => {
    const half = {
      declaredAmount: null,
      quantity: '1.000',
      totalValue: '0.0050',
      unitValue: '0.0050',
    }
    const summary = resolveOccurrenceAmounts({ declaredAmount: null, lines: [half, half, half] })

    expect(summary.lines.map((line) => line.lineAmountCents)).toEqual([1n, 1n, 1n])
    expect(summary.itemsSumCents).toBe(3n)
    expect(summary.declaredAmountCents).toBe(3n)
  })

  test('0,1 + 0,2 fecha em 0,30', () => {
    const summary = resolveOccurrenceAmounts({
      declaredAmount: null,
      lines: [
        { ...NOTE_LINE, totalValue: '0.1000', unitValue: '0.1000' },
        { ...NOTE_LINE, totalValue: '0.2000', unitValue: '0.2000' },
      ],
    })

    expect(summary.itemsSumCents).toBe(30n)
  })

  test('o valor pago da linha vence no valor do item, e a soma calculada continua', () => {
    const summary = resolveOccurrenceAmounts({
      declaredAmount: null,
      lines: [{ ...NOTE_LINE, declaredAmount: '50.0000' }, NOTE_LINE],
    })

    expect(summary.lines).toEqual([
      { itemAmountCents: 5000n, lineAmountCents: 5720n },
      { itemAmountCents: 5720n, lineAmountCents: 5720n },
    ])
    expect(summary.itemsSumCents).toBe(11440n)
    expect(summary.declaredAmountCents).toBe(10720n)
  })

  test('valor pago nulo cai na soma da linha, e linha sem quantidade cai no vProd', () => {
    const summary = resolveOccurrenceAmounts({
      declaredAmount: null,
      lines: [{ declaredAmount: null, quantity: null, totalValue: '12.3450', unitValue: '4.1150' }],
    })

    expect(summary.lines).toEqual([{ itemAmountCents: 1235n, lineAmountCents: 1235n }])
  })

  test('o valor pago da ocorrência vence a soma dos itens, que continua disponível', () => {
    const summary = resolveOccurrenceAmounts({ declaredAmount: '199.9900', lines: [NOTE_LINE] })

    expect(summary.declaredAmountCents).toBe(19999n)
    expect(summary.itemsSumCents).toBe(5720n)
  })

  test('zero digitado é valor, não vazio', () => {
    const summary = resolveOccurrenceAmounts({
      declaredAmount: null,
      lines: [{ ...NOTE_LINE, declaredAmount: '0.0000' }],
    })
    expect(summary.lines[0]?.itemAmountCents).toBe(0n)
    expect(summary.declaredAmountCents).toBe(0n)

    expect(
      resolveOccurrenceAmounts({ declaredAmount: '0.0000', lines: [NOTE_LINE] })
        .declaredAmountCents,
    ).toBe(0n)
  })

  test('sem item e sem valor pago não há soma a imprimir', () => {
    expect(resolveOccurrenceAmounts({ declaredAmount: null, lines: [] })).toEqual({
      declaredAmountCents: null,
      itemsSumCents: null,
      lines: [],
    })
  })

  test('sem item, o valor pago da ocorrência ainda vale', () => {
    expect(
      resolveOccurrenceAmounts({ declaredAmount: '50.0000', lines: [] }).declaredAmountCents,
    ).toBe(5000n)
  })
})

/** ⚠️ Contrato de parede só barra a volta do defeito; o que prova a regra é a mutação, registrada. */
describe('a política não usa número binário para dinheiro (spec 247 RNF)', () => {
  test('o arquivo não chama Number, parseFloat, toFixed nem Math', () => {
    const code = POLICY_SOURCE.split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n')

    expect(code).not.toMatch(/\bNumber\s*\(/u)
    expect(code).not.toMatch(/\bparseFloat\b/u)
    expect(code).not.toMatch(/\bparseInt\b/u)
    expect(code).not.toMatch(/\.toFixed\b/u)
    expect(code).not.toMatch(/\bMath\./u)
  })
})
