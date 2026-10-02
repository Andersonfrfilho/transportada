/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 232 T3.1 — a nota diz quanto rendeu e quanto gastou. A API passou a mandar, em cada item de
 * `revenueLines`, oito campos opcionais que saem juntos ou nenhum sai; a guarda de tipo é escrita à
 * mão (esta app não usa zod) e o serviço de formatação entrega à tela o que ela só imprime.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import financialsEn from '@/modules/trip-financials/locales/tripFinancials.en.locale.json'
import financialsPt from '@/modules/trip-financials/locales/tripFinancials.locale.json'
import {
  describeRevenueLineCost,
  type RevenueLineCostView,
} from '@/modules/trip-financials/shared/revenueLineCost.service'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'
import { COST_BASES, TIME_BASES } from '@/modules/trip-financials/shared/tripValuation.constant'
import type {
  TripValuation,
  TripValuationRevenueLine,
} from '@/modules/trip-financials/shared/tripValuation.service'
import { toTripValuation } from '@/modules/trip-financials/shared/tripValuationResponse.validation'

const API_TYPES = '../../../api-transportada/src/trips/domain/document-cost-apportionment.types.ts'
const NON_BREAKING_SPACE = /\u00a0/g

type Locale = Readonly<Record<string, unknown>>

/** Resolve a chave pontuada e **lança** se ela não existir: chave ausente num locale é defeito. */
function translatorFor(locale: Locale): Translate {
  return (key) => {
    let current: unknown = locale
    for (const part of key.split('.')) {
      if (typeof current !== 'object' || current === null) throw new Error(`sem chave: ${key}`)
      current = (current as Record<string, unknown>)[part]
    }
    if (typeof current !== 'string') throw new Error(`sem chave: ${key}`)

    return current
  }
}

const translatePt = translatorFor(financialsPt)
const translateEn = translatorFor(financialsEn)

function completeFigures(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    costAmount: '400.0000',
    costBasis: 'leg',
    legCostAmount: '300.0000',
    marginAmount: '540.0000',
    marginPercentage: '54.0000',
    taxAmount: '60.0000',
    timeBasis: 'complete',
    tripShareCostAmount: '100.0000',
    ...overrides,
  }
}

function revenueLine(figures: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return {
    amount: '1000.0000',
    freightRuleId: null,
    freightRuleName: null,
    gap: null,
    nfeDocumentId: null,
    percentage: null,
    source: 'estimated',
    tripDocumentId: 'document-1',
    ...figures,
  }
}

function envelope(lines: readonly Record<string, unknown>[]): unknown {
  return {
    data: {
      costParcels: [],
      hasGaps: false,
      marginPercentage: '54.0000',
      revenueLines: lines,
      revenueSource: 'estimated',
      totalCost: '400.0000',
      totalMargin: '600.0000',
      totalRevenue: '1000.0000',
    },
  }
}

function parsedLine(figures: Readonly<Record<string, unknown>>): TripValuationRevenueLine {
  const valuation: TripValuation | null = toTripValuation(envelope([revenueLine(figures)]))
  const line = valuation?.revenueLines[0]
  if (line === undefined) throw new Error('a avaliação deveria ter sido lida')

  return line
}

function viewOf(figures: Readonly<Record<string, unknown>>, t = translatePt): RevenueLineCostView {
  const view = describeRevenueLineCost({ line: parsedLine(figures), t })
  if (view === null) throw new Error('a linha deveria ter gasto')

  return view
}

function availableViewOf(figures: Readonly<Record<string, unknown>>) {
  const view = viewOf(figures)
  if (view.status !== 'available') throw new Error('a linha deveria ter gasto disponível')

  return view
}

function plain(text: string): string {
  return text.replace(NON_BREAKING_SPACE, ' ')
}

function apiVocabulary(constantName: string): readonly string[] {
  const source = readFileSync(new URL(API_TYPES, import.meta.url), 'utf8')
  const start = source.indexOf(`export const ${constantName}`)
  const block = source.slice(start, source.indexOf('} as const', start))

  return [...block.matchAll(/'([a-z]+)'/g)].map((match) => match[1] ?? '')
}

describe('a linha da nota com gasto e lucro (spec 232 T3.1)', () => {
  it('linha completa: gasto com as duas partes nomeadas, imposto, lucro e margem', () => {
    const view = availableViewOf(completeFigures())

    expect(view.cost.label).toBe('Gasto')
    expect(plain(view.cost.amount)).toBe('R$ 400,00')
    expect(view.parts.map((part) => part.label)).toEqual(['do trecho', 'rateio da viagem'])
    expect(view.parts.map((part) => plain(part.amount))).toEqual(['R$ 300,00', 'R$ 100,00'])
    expect(plain(view.tax?.amount ?? '')).toBe('R$ 60,00')
    expect(view.profit.label).toBe('Lucro')
    expect(plain(view.profit.amount)).toBe('R$ 540,00')
    expect(view.margin).toEqual({ amount: '54,00%', label: 'Margem' })
    expect(view.isLoss).toBe(false)
    expect(view.timeNotice).toBeNull()
  })

  it('o frete da linha segue sendo amount, e as duas partes dão o gasto', () => {
    const line = parsedLine(completeFigures())

    expect(line.amount).toBe('1000.0000')
    expect('freightAmount' in line).toBe(false)
    expect(line.costAmount).toBe('400.0000')
    expect(line.costBasis).toBe('leg')
  })

  it('linha sem os oito campos (prévia e sugestão) é válida e não tem gasto', () => {
    const line = parsedLine({})

    expect(line.amount).toBe('1000.0000')
    for (const key of Object.keys(completeFigures())) expect(key in line).toBe(false)
    expect(describeRevenueLineCost({ line, t: translatePt })).toBeNull()
  })

  it('lucro negativo é perda e aparece negativo, nunca zerado', () => {
    const view = availableViewOf(
      completeFigures({ marginAmount: '-25.5000', marginPercentage: '-2.5500' }),
    )

    expect(view.isLoss).toBe(true)
    expect(plain(view.profit.amount)).toBe('-R$ 25,50')
    expect(view.margin?.amount).toBe('-2,55%')
  })

  it('frete zero: sem margem percentual, e o lucro continua existindo', () => {
    const view = availableViewOf(completeFigures({ marginPercentage: null }))

    expect(view.margin).toBeNull()
    expect(plain(view.profit.amount)).toBe('R$ 540,00')
  })

  it('roteiro não calculado: sem gasto, lucro nem margem, e com o texto que a tela já usa', () => {
    const view = viewOf(
      completeFigures({
        costAmount: null,
        costBasis: 'unavailable',
        legCostAmount: null,
        marginAmount: null,
        marginPercentage: null,
        tripShareCostAmount: null,
      }),
    )

    expect(view.status).toBe('unavailable')
    if (view.status !== 'unavailable') return
    expect(view.reason).toBe(financialsPt.gap.NO_PLANNED_DISTANCE)
    expect(view.reason).toBe('roteiro ainda não calculado')
    expect(plain(view.tax?.amount ?? '')).toBe('R$ 60,00')
    expect('cost' in view || 'profit' in view || 'margin' in view).toBe(false)
  })

  it('imposto que a API não pôde distribuir (nulo) é aceito e a tela não imprime imposto (revisão M3)', () => {
    const figures = {
      costAmount: null,
      costBasis: 'unavailable',
      legCostAmount: null,
      marginAmount: null,
      marginPercentage: null,
      taxAmount: null,
      tripShareCostAmount: null,
    }
    const line = parsedLine(completeFigures(figures))
    const view = describeRevenueLineCost({ line, t: translatePt })

    expect(line.taxAmount).toBeNull()
    expect(view?.status).toBe('unavailable')
    expect(view?.tax).toBeNull()
  })

  it('roteiro não calculado em inglês reaproveita a chave gap.NO_PLANNED_DISTANCE', () => {
    const view = viewOf(
      completeFigures({
        costAmount: null,
        costBasis: 'unavailable',
        legCostAmount: null,
        marginAmount: null,
        marginPercentage: null,
        tripShareCostAmount: null,
      }),
      translateEn,
    )

    expect(view.status === 'unavailable' && view.reason).toBe(financialsEn.gap.NO_PLANNED_DISTANCE)
  })

  it('tempo completo não avisa; parcial e incompleto dizem o que faltou', () => {
    const notices = TIME_BASES.map((timeBasis) =>
      availableViewOf(completeFigures({ timeBasis })),
    ).map((view) => view.timeNotice)

    expect(notices).toEqual([
      null,
      'Tempo incompleto: faltou a chegada em alguma parada.',
      'Tempo parcial: faltou a saída de alguma parada.',
    ])
    expect(TIME_BASES).toEqual(['complete', 'incomplete', 'partial'])
  })
})

describe('a guarda rejeita o corpo malformado em vez de aceitar e seguir', () => {
  const malformed: readonly (readonly [string, Readonly<Record<string, unknown>>])[] = [
    ['gasto como número', completeFigures({ costAmount: 400 })],
    ['gasto que não é decimal', completeFigures({ costAmount: 'quatrocentos' })],
    ['mais de quatro casas decimais', completeFigures({ costAmount: '400.00001' })],
    ['imposto como booleano', completeFigures({ taxAmount: true })],
    ['margem percentual como número', completeFigures({ marginPercentage: 54 })],
    ['critério de gasto desconhecido', completeFigures({ costBasis: 'estimated' })],
    ['base de tempo desconhecida', completeFigures({ timeBasis: 'exact' })],
    ['base de tempo como número', completeFigures({ timeBasis: 1 })],
    ['indisponível com gasto zero em vez de nulo', completeFigures({ costBasis: 'unavailable' })],
    ['trecho com gasto nulo', completeFigures({ costAmount: null })],
    ['trecho com lucro nulo', completeFigures({ marginAmount: null })],
  ]

  it.each(malformed)('rejeita: %s', (_description, figures) => {
    expect(toTripValuation(envelope([revenueLine(figures)]))).toBeNull()
  })

  it('rejeita campos pela metade: os oito saem juntos ou nenhum sai', () => {
    const withoutTimeBasis = Object.fromEntries(
      Object.entries(completeFigures()).filter(([key]) => key !== 'timeBasis'),
    )

    expect(toTripValuation(envelope([revenueLine(withoutTimeBasis)]))).toBeNull()
    expect(toTripValuation(envelope([revenueLine({ costAmount: '400.0000' })]))).toBeNull()
  })

  it('uma linha malformada derruba a avaliação, mesmo entre linhas boas', () => {
    const lines = [
      revenueLine({}),
      revenueLine(completeFigures({ taxAmount: 60 })),
      revenueLine({}),
    ]

    expect(toTripValuation(envelope(lines))).toBeNull()
  })

  it('misturar linhas com e sem os campos é aceito', () => {
    const valuation = toTripValuation(envelope([revenueLine({}), revenueLine(completeFigures())]))

    expect(valuation?.revenueLines).toHaveLength(2)
    expect(valuation?.revenueLines[0]?.costBasis).toBeUndefined()
    expect(valuation?.revenueLines[1]?.costBasis).toBe('leg')
  })
})

describe('o vocabulário e os rótulos', () => {
  it('COST_BASES e TIME_BASES são cópia por valor da API', () => {
    expect(COST_BASES.map(String).sort()).toEqual([...apiVocabulary('COST_BASES')].sort())
    expect(TIME_BASES.map(String).sort()).toEqual([...apiVocabulary('TIME_BASES')].sort())
  })

  it('os dois locales têm as mesmas chaves de documentCost', () => {
    const flatten = (value: unknown, prefix = ''): readonly string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([key, child]) => flatten(child, `${prefix}${key}.`))
        : [prefix]

    expect([...flatten(financialsEn.documentCost)].sort()).toEqual(
      [...flatten(financialsPt.documentCost)].sort(),
    )
  })

  it('toda base de tempo que avisa tem rótulo nos dois locales', () => {
    for (const timeBasis of TIME_BASES) {
      expect(translatePt(`documentCost.timeBasis.${timeBasis}`)).not.toBe('')
      expect(translateEn(`documentCost.timeBasis.${timeBasis}`)).not.toBe('')
    }
  })

  it('a ausência de roteiro não ganha texto novo: nenhum rótulo de documentCost a repete', () => {
    const texts = Object.values(financialsPt.documentCost).filter(
      (value): value is string => typeof value === 'string',
    )

    expect(texts.some((text) => text.includes('roteiro ainda não calculado'))).toBe(false)
  })
})
