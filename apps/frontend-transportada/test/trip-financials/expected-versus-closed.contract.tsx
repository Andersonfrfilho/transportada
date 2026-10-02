/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 226 T3.3 (D6, CA08) — o painel da viagem mostra o previsto e o fechado lado a lado, com a
 * diferença entre eles (fechado menos previsto). Viagem aberta mostra só o previsto e diz que o
 * fechado ainda não existe.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { TripFinancialPanel } from '@/modules/trip-financials/components/TripFinancialPanel.component'
import type { TripCostEntriesController } from '@/modules/trip-financials/hooks/useTripCostEntries.hook'
import financialsEn from '@/modules/trip-financials/locales/tripFinancials.en.locale.json'
import financialsPt from '@/modules/trip-financials/locales/tripFinancials.locale.json'
import { buildExpectedVersusClosed } from '@/modules/trip-financials/shared/expectedVersusClosed.service'
import type { TripFinancialResult } from '@/modules/trip-financials/shared/tripFinancials.types'
import {
  summarizeTripValuation,
  type TripValuation,
} from '@/modules/trip-financials/shared/tripValuation.service'

const NO_ENTRIES: TripCostEntriesController = {
  canReadEntries: false,
  canRecord: false,
  entries: [],
  entryKinds: [],
  isError: false,
  isLoading: false,
  isRecording: false,
  isRemoving: false,
  record: () => Promise.resolve(true),
  remove: () => Promise.resolve(true),
  retry: () => undefined,
}

/** Previsto: receita 2000, custo 1365,45 (imposto 73 incluído), resultado 634,55. */
function valuation(overrides: Partial<TripValuation> = {}): TripValuation {
  return {
    costParcels: [
      {
        amount: '812.4500',
        basis: null,
        detail: null,
        gap: null,
        kind: 'driver',
        source: 'measured',
      },
      {
        amount: '480.0000',
        basis: null,
        detail: null,
        gap: null,
        kind: 'fuel',
        source: 'measured',
      },
      {
        amount: '73.0000',
        basis: null,
        detail: null,
        gap: null,
        kind: 'pis_cofins',
        source: 'measured',
      },
    ],
    hasGaps: false,
    marginPercentage: '31.727500',
    revenueLines: [],
    revenueSource: 'measured',
    totalCost: '1365.4500',
    totalMargin: '634.5500',
    totalRevenue: '2000.0000',
    ...overrides,
  }
}

/** Fechado: mesma receita, custo + imposto 1392,45 (27 a mais), resultado 607,55. */
function closed(overrides: Partial<TripFinancialResult> = {}): TripFinancialResult {
  return {
    costTotal: '1319.4500',
    frozenAt: '2026-09-01T12:00:00.000Z',
    isComplete: true,
    marginRate: '30.377500',
    netAmount: '607.5500',
    parcels: [
      { amount: '1319.4500', kind: 'driver', nature: 'cost', note: '', source: 'measured' },
      { amount: '73.0000', kind: 'pis_cofins', nature: 'tax', note: '', source: 'measured' },
    ],
    recalculationReason: '',
    revenueAmount: '2000.0000',
    revenueDocumentCount: 1,
    revenueExpectedCount: 1,
    taxTotal: '73.0000',
    version: 1,
    ...overrides,
  }
}

function summary(input: TripValuation = valuation()) {
  const expected = summarizeTripValuation(input)
  if (expected === null) throw new Error('valuation expected')

  return expected
}

function renderPanel(input: { result: TripFinancialResult | null; valuation: TripValuation }) {
  return renderToStaticMarkup(
    <TripFinancialPanel
      costEntries={NO_ENTRIES}
      isError={false}
      isLoading={false}
      onRecalculate={() => Promise.resolve()}
      onRetry={() => undefined}
      result={input.result}
      valuation={input.valuation}
    />,
  )
}

describe('a diferença entre o previsto e o fechado (spec 226 D6)', () => {
  it('é fechado menos previsto, linha a linha, com o imposto dentro do custo dos dois lados', () => {
    const rows = buildExpectedVersusClosed({ closed: closed(), expected: summary() })

    expect(rows.map((row) => [row.line, row.expected, row.closed, row.difference])).toEqual([
      ['revenue', '2000.0000', '2000.0000', '0.0000'],
      ['cost', '1365.4500', '1392.4500', '27.0000'],
      ['result', '634.5500', '607.5500', '-27.0000'],
    ])
  })

  it('diferença zero é dita, não escondida', () => {
    const rows = buildExpectedVersusClosed({ closed: closed(), expected: summary() })

    expect(rows.map((row) => row.isDifferenceZero)).toEqual([true, false, false])
  })

  it('não passa por ponto flutuante: centavos que o binário perderia saem exatos', () => {
    const rows = buildExpectedVersusClosed({
      closed: closed({ revenueAmount: '0.3000' }),
      expected: summary(valuation({ totalRevenue: '0.1000' })),
    })

    expect(rows[0]?.difference).toBe('0.2000')
  })
})

describe('o nome da coluna da conta de agora não promete uma previsão (spec 226 D6, revisão M5)', () => {
  /**
   * A coluna é a avaliação **calculada agora**, pela mesma função que gerou o congelado — não a
   * previsão do planejamento, que ninguém grava. "Previsto" prometia mais do que ela entrega, e a
   * diferença tende a sair sempre "sem diferença". Decisão do usuário em 2026-10-02.
   */
  it('chama-se conta atual nos dois idiomas, e nenhum deles diz previsto', () => {
    expect(financialsPt.comparison.expected).toBe('Conta atual')
    expect(financialsEn.comparison.expected).toBe('Current account')
    expect(financialsPt.comparison.caption).not.toMatch(/previst/iu)
    expect(financialsEn.comparison.caption).not.toMatch(/expected/iu)
  })
})

describe('o painel com a viagem fechada (CA08)', () => {
  const markup = renderPanel({ result: closed(), valuation: valuation() })

  it('rotula previsto e fechado, e mostra a diferença', () => {
    expect(markup).toContain(
      `<h3 id="trip-financial-expected">${financialsPt.comparison.expected}</h3>`,
    )
    expect(markup).toContain(
      `<h3 id="trip-financial-closed">${financialsPt.comparison.closed}</h3>`,
    )
    expect(markup).toContain(financialsPt.comparison.difference)
    expect(markup).toContain(
      `<th scope="row">${financialsPt.comparison.lines.cost}</th>` +
        `<td>${formatAmount('1365.4500')}</td><td>${formatAmount('1392.4500')}</td>` +
        `<td>+${formatAmount('27.0000')}</td>`,
    )
    expect(markup).toContain(
      `<th scope="row">${financialsPt.comparison.lines.result}</th>` +
        `<td>${formatAmount('634.5500')}</td><td>${formatAmount('607.5500')}</td>` +
        `<td>${formatAmount('-27.0000')}</td>`,
    )
  })

  it('a linha sem diferença diz que não há diferença', () => {
    expect(markup).toContain(financialsPt.comparison.noDifference)
  })

  it('compara em tabela com cabeçalho de coluna e de linha', () => {
    expect(markup).toContain(`<th scope="row">${financialsPt.comparison.lines.revenue}</th>`)
    expect(markup).toContain(`<th scope="col">${financialsPt.comparison.difference}</th>`)
  })

  it('não diz que o fechado ainda não existe', () => {
    expect(markup).not.toContain(financialsPt.panel.notFrozen)
  })

  it('o fechado incompleto continua avisando que o número não é final', () => {
    const incomplete = renderPanel({
      result: closed({ isComplete: false, revenueDocumentCount: 8, revenueExpectedCount: 10 }),
      valuation: valuation(),
    })

    expect(incomplete).toContain('Receita de 8 de 10 notas')
  })

  it('parcela sem cadastro no fechado continua avisando que o total é aproximado', () => {
    const approximate = renderPanel({
      result: closed({
        isComplete: false,
        parcels: [
          {
            amount: '0.0000',
            kind: 'fuel',
            nature: 'cost',
            note: 'NO_FUEL_BASELINE',
            source: 'missing',
          },
        ],
      }),
      valuation: valuation(),
    })

    expect(approximate).toContain('1 parcela sem cadastro')
  })
})

describe('o painel com a viagem aberta (CA08)', () => {
  const markup = renderPanel({ result: null, valuation: valuation() })

  it('mostra só o previsto', () => {
    expect(markup).toContain(
      `<h3 id="trip-financial-expected">${financialsPt.comparison.expected}</h3>`,
    )
    expect(markup).toContain('2.000,00')
  })

  it('diz que o fechado ainda não existe, sob o próprio rótulo, em vez de um campo vazio', () => {
    expect(markup).toContain(
      `<h3 id="trip-financial-closed">${financialsPt.comparison.closed}</h3>`,
    )
    expect(markup).toContain(financialsPt.panel.notFrozen)
  })

  it('não inventa diferença nem zero para o que não existe', () => {
    expect(markup).not.toContain(financialsPt.comparison.difference)
    expect(markup).not.toContain(financialsPt.comparison.noDifference)
    expect(markup).not.toContain(financialsPt.panel.recalculate)
  })
})

describe('os rótulos da comparação nos dois idiomas', () => {
  it('toda chave de comparison existe em pt-BR e em en', () => {
    expect(Object.keys(financialsEn.comparison).sort()).toEqual(
      Object.keys(financialsPt.comparison).sort(),
    )
    expect(Object.keys(financialsEn.comparison.lines).sort()).toEqual(
      Object.keys(financialsPt.comparison.lines).sort(),
    )
  })
})
