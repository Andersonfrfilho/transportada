/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  formatRulePercentage,
  resolveNoteRevenue,
  totalAssemblyAmount,
  totalAssemblyFreight,
  totalAssemblyWeight,
  type AssemblyRevenueLine,
} from '../../src/modules/trip/shared/assemblyNoteFigures.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ASSEMBLY_MAP_PATH = 'src/modules/trip/components/TripAssemblyMap.component.tsx'
const QUICK_CREATE_PATH = 'src/modules/trip/components/TripQuickCreateDialog.component.tsx'

function readSource(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

function note(
  weight: null | string,
  source: 'estimated' | 'xml' | null = 'xml',
  amount: null | string = '1000.0000',
) {
  return { cargoGrossWeight: weight, cargoWeightSource: source, totalAmount: amount }
}

function line(
  nfeDocumentId: string,
  source: AssemblyRevenueLine['source'],
  amount = '120.0000',
): AssemblyRevenueLine {
  return { amount, nfeDocumentId, source }
}

describe('valor, peso e frete na linha da parada', () => {
  test('a receita da nota vem da avaliação, com a marca de prevista', () => {
    const revenue = resolveNoteRevenue({
      nfeDocumentId: 'a',
      revenueLines: [line('a', 'estimated'), line('b', 'measured')],
    })

    expect(revenue).toEqual({
      amount: '120.0000',
      isEstimated: true,
      percentage: null,
      ruleName: null,
    })
  })

  /**
   * ⚠️ A procedência é da regra de **frete**, não do perfil de emissão. Sem ela, duas regras
   * empatadas em prioridade produzem números diferentes e ninguém consegue dizer qual respondeu.
   */
  test('a receita carrega a regra que a precificou, e o percentual dela', () => {
    const revenue = resolveNoteRevenue({
      nfeDocumentId: 'a',
      revenueLines: [
        { ...line('a', 'estimated'), freightRuleName: 'Spani', percentage: '0.045000' },
      ],
    })

    expect(revenue?.ruleName).toBe('Spani')
    expect(revenue?.percentage).toBe('0.045000')
  })

  test('percentual decimal vira rótulo legível, sem passar por número', () => {
    expect(formatRulePercentage('0.045000')).toBe('4,5%')
    expect(formatRulePercentage('0.120000')).toBe('12%')
    expect(formatRulePercentage('0.045500')).toBe('4,55%')
  })

  /** Receita realizada vem do CT-e emitido; nomear uma regra ali diria que a conta foi refeita. */
  test('linha realizada não inventa regra', () => {
    const revenue = resolveNoteRevenue({
      nfeDocumentId: 'b',
      revenueLines: [line('b', 'measured')],
    })

    expect(revenue?.ruleName).toBeNull()
  })

  test('cálculo já gravado não é previsão', () => {
    const revenue = resolveNoteRevenue({
      nfeDocumentId: 'b',
      revenueLines: [line('b', 'measured')],
    })

    expect(revenue?.isEstimated).toBe(false)
  })

  /**
   * ⚠️ A avaliação devolve `0` **com a razão da lacuna ao lado** quando não há regra de frete para
   * o destino. Imprimir esse zero diria que a nota não rende nada — afirmação diferente de "ninguém
   * sabe quanto ela rende", e é a segunda que é verdadeira.
   */
  test('lacuna vira ausência, nunca R$ 0,00', () => {
    expect(
      resolveNoteRevenue({ nfeDocumentId: 'c', revenueLines: [line('c', 'missing', '0.0000')] }),
    ).toBeNull()
  })

  /**
   * ⚠️ O frete é função do **valor da nota e da regra** — não do veículo nem do motorista. A
   * avaliação da viagem só é consultada depois de escolher o caminhão, e antes disso a linha ficava
   * sem ganho justamente para quem está decidindo o que carregar. A base vem da listagem, que
   * calcula sem veículo.
   */
  test('sem avaliação, o previsto da listagem responde', () => {
    const revenue = resolveNoteRevenue({
      fallback: { amount: '136.8900', ruleName: 'Spani' },
      nfeDocumentId: 'a',
      revenueLines: [],
    })

    expect(revenue?.amount).toBe('136.8900')
    expect(revenue?.ruleName).toBe('Spani')
    expect(revenue?.isEstimated).toBe(true)
  })

  /** A avaliação vence a base: ela também conhece a receita já realizada pelo CT-e emitido. */
  test('havendo avaliação, ela sobrepõe a base', () => {
    const revenue = resolveNoteRevenue({
      fallback: { amount: '999.0000', ruleName: 'Base' },
      nfeDocumentId: 'a',
      revenueLines: [line('a', 'measured', '120.0000')],
    })

    expect(revenue?.amount).toBe('120.0000')
    expect(revenue?.isEstimated).toBe(false)
  })

  /** `missing` é a avaliação **sabendo** que não há regra: essa resposta vence o palpite anterior. */
  test('lacuna declarada vence a base da listagem', () => {
    expect(
      resolveNoteRevenue({
        fallback: { amount: '136.8900', ruleName: 'Spani' },
        nfeDocumentId: 'c',
        revenueLines: [line('c', 'missing', '0.0000')],
      }),
    ).toBeNull()
  })

  test('o frete previsto soma à parte do valor e do peso', () => {
    expect(
      totalAssemblyFreight([
        { freightAmount: '136.8900' },
        { freightAmount: null },
        { freightAmount: '34.6100' },
      ]),
    ).toBe('171.5000')
    expect(totalAssemblyFreight([{ freightAmount: null }])).toBeNull()
  })

  test('nota fora da avaliação não inventa receita', () => {
    expect(
      resolveNoteRevenue({ nfeDocumentId: 'z', revenueLines: [line('a', 'measured')] }),
    ).toBeNull()
  })

  test('o peso total soma só as notas pesadas', () => {
    expect(totalAssemblyWeight([note('10.0000'), note(null, null), note('2.5000')])).toEqual({
      isEstimated: false,
      weight: '12.5000',
    })
  })

  /**
   * ⚠️ **Uma nota estimada torna o total estimado** — mesma regra da ocupação do baú. Somar palpite
   * com massa medida dá um número cuja natureza é a do pior componente.
   */
  test('uma nota estimada torna o total estimado', () => {
    expect(totalAssemblyWeight([note('10.0000'), note('5.0000', 'estimated')])?.isEstimated).toBe(
      true,
    )
  })

  test('seleção sem peso nenhum é ausência, não zero', () => {
    expect(totalAssemblyWeight([note(null, null), note(null, null)])).toBeNull()
  })

  test('o valor total soma as notas da seleção', () => {
    expect(
      totalAssemblyAmount([note('1.0000', 'xml', '10.5000'), note(null, null, '4.5000')]),
    ).toBe('15.0000')
  })

  /**
   * A fiação é cobrada por texto de fonte porque o teste desta app não tem DOM: recalcular a
   * receita no cliente compilaria e passaria em tudo, e produziria um segundo número que discorda
   * do painel de margem logo abaixo no primeiro mínimo ou máximo cadastrado na regra.
   */
  test('a tela consome a receita da avaliação, não uma conta própria', () => {
    const dialog = readSource(QUICK_CREATE_PATH)
    const map = readSource(ASSEMBLY_MAP_PATH)

    expect(dialog).toContain('revenueLines={valuationPreview.valuation?.revenueLines}')
    expect(map).toContain('resolveNoteRevenue({')
    expect(map).toContain('revenueLines: revenueLines ?? []')
    expect(map).not.toContain('calculatePercentageFreight')
  })

  test('os totais somam a seleção, nunca o enquadramento', () => {
    const source = readSource(ASSEMBLY_MAP_PATH)

    expect(source).toContain('totalAssemblyWeight(selected)')
    expect(source).toContain('totalAssemblyAmount(selected)')
    expect(source).not.toContain('totalAssemblyWeight(nearby)')
  })
})
