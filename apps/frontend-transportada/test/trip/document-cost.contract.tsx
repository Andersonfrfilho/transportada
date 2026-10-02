/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 232 T3.2 (RF4/RF6/RF9) — a linha da nota diz o que gastou e o que lucrou, com o gasto em duas
 * partes. Cobre o **renderizado** (`renderToStaticMarkup`, sem jsdom) e prende que, sem a avaliação
 * — quem não tem `trip.financials` nunca a recebe —, a nota não imprime rótulo, traço nem espaço.
 */
import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { DocumentCostProvider } from '@/modules/trip-financials/components/DocumentCostProvider.component'
import { TripDocumentCostCriterion } from '@/modules/trip-financials/components/TripDocumentCostCriterion.component'
import { TripDocumentCost } from '@/modules/trip-financials/components/TripDocumentCost.component'
import financialsEn from '@/modules/trip-financials/locales/tripFinancials.en.locale.json'
import financialsPt from '@/modules/trip-financials/locales/tripFinancials.locale.json'
import type {
  TripValuation,
  TripValuationRevenueLine,
} from '@/modules/trip-financials/shared/tripValuation.service'

const NON_BREAKING_SPACE = /\u00a0/g
const DOCUMENT_ID = 'document-1'
const STOP_LIST = new URL(
  '../../src/modules/trip/components/TripStopList.component.tsx',
  import.meta.url,
)
const DATA_COMPONENT = new URL(
  '../../src/modules/trip/components/TripDocumentData.component.tsx',
  import.meta.url,
)
const COST_COMPONENT = new URL(
  '../../src/modules/trip-financials/components/TripDocumentCost.component.tsx',
  import.meta.url,
)
const STYLESHEET = new URL(
  '../../src/modules/trip-financials/styles/tripFinancials.module.css',
  import.meta.url,
)
const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)
const DETAIL_PAGE = new URL('../../src/modules/trip/pages/TripDetail.page.tsx', import.meta.url)

function ruleBodyOf(stylesheet: string, className: string): string {
  return new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`, 'u').exec(stylesheet)?.[1] ?? ''
}

function buildLine(overrides: Partial<TripValuationRevenueLine> = {}): TripValuationRevenueLine {
  return {
    amount: '1000.0000',
    costAmount: '400.0000',
    costBasis: 'leg',
    freightRuleId: null,
    freightRuleName: null,
    gap: null,
    legCostAmount: '300.0000',
    marginAmount: '540.0000',
    marginPercentage: '54.0000',
    nfeDocumentId: null,
    percentage: null,
    source: 'estimated',
    taxAmount: '60.0000',
    timeBasis: 'complete',
    tripDocumentId: DOCUMENT_ID,
    tripShareCostAmount: '100.0000',
    ...overrides,
  }
}

function buildValuation(lines: readonly TripValuationRevenueLine[]): TripValuation {
  return {
    costParcels: [],
    hasGaps: false,
    marginPercentage: '54.0000',
    revenueLines: lines,
    revenueSource: 'estimated',
    totalCost: '400.0000',
    totalMargin: '600.0000',
    totalRevenue: '1000.0000',
  }
}

function renderCost(valuation: null | TripValuation): string {
  return renderToStaticMarkup(
    <DocumentCostProvider valuation={valuation}>
      <TripDocumentCost documentId={DOCUMENT_ID} />
    </DocumentCostProvider>,
  ).replace(NON_BREAKING_SPACE, ' ')
}

describe('a linha da nota com gasto, lucro e margem (spec 232 T3.2)', () => {
  it('linha com os campos: gasto com as duas partes nomeadas, lucro e margem', () => {
    const html = renderCost(buildValuation([buildLine()]))

    expect(html).toContain('Gasto')
    expect(html).toContain('R$ 400,00')
    expect(html).toContain('do trecho R$ 300,00')
    expect(html).toContain('rateio da viagem R$ 100,00')
    expect(html).toContain('Lucro')
    expect(html).toContain('R$ 540,00')
    expect(html).toContain('Margem')
    expect(html).toContain('54,00%')
    expect(html).not.toContain(financialsPt.documentCost.splitCriterion)
  })

  it('o critério do rateio sai uma vez por nota, junto do rateio, e nunca na linha de gasto', () => {
    const valuation = buildValuation([buildLine(), buildLine({ tripDocumentId: 'outra-nota' })])
    const criterion = renderToStaticMarkup(
      <DocumentCostProvider valuation={valuation}>
        <TripDocumentCostCriterion documentId={DOCUMENT_ID} />
      </DocumentCostProvider>,
    )

    expect(criterion).toContain(financialsPt.documentCost.splitCriterion)
    expect(criterion.split(financialsPt.documentCost.splitCriterion)).toHaveLength(2)
    expect(renderToStaticMarkup(<TripDocumentCostCriterion documentId={DOCUMENT_ID} />)).toBe('')
    expect(renderCost(valuation)).not.toContain(financialsPt.documentCost.splitCriterion)
  })

  it('o critério não aparece para a nota sem rateio (roteiro não calculado)', () => {
    const unavailable = buildLine({
      costAmount: null,
      costBasis: 'unavailable',
      legCostAmount: null,
      marginAmount: null,
      marginPercentage: null,
      tripShareCostAmount: null,
    })

    expect(
      renderToStaticMarkup(
        <DocumentCostProvider valuation={buildValuation([unavailable])}>
          <TripDocumentCostCriterion documentId={DOCUMENT_ID} />
        </DocumentCostProvider>,
      ),
    ).toBe('')
  })

  it('sem permissão (avaliação ausente) a nota não imprime nada', () => {
    expect(renderCost(null)).toBe('')
  })

  it('avaliação sem a linha desta nota não imprime nada', () => {
    expect(renderCost(buildValuation([buildLine({ tripDocumentId: 'outra-nota' })]))).toBe('')
  })

  it('fora de qualquer provedor a nota não imprime nada', () => {
    expect(renderToStaticMarkup(<TripDocumentCost documentId={DOCUMENT_ID} />)).toBe('')
  })

  it('linha sem os oito campos (prévia e sugestão) não imprime nada', () => {
    const bare: TripValuationRevenueLine = {
      amount: '1000.0000',
      freightRuleId: null,
      freightRuleName: null,
      gap: null,
      nfeDocumentId: null,
      percentage: null,
      source: 'estimated',
      tripDocumentId: DOCUMENT_ID,
    }

    expect(renderCost(buildValuation([bare]))).toBe('')
  })

  it('roteiro não calculado: diz o motivo e não imprime gasto, lucro nem margem', () => {
    const html = renderCost(
      buildValuation([
        buildLine({
          costAmount: null,
          costBasis: 'unavailable',
          legCostAmount: null,
          marginAmount: null,
          marginPercentage: null,
          tripShareCostAmount: null,
        }),
      ]),
    )

    expect(html).toContain(financialsPt.gap.NO_PLANNED_DISTANCE)
    expect(html).not.toContain('Gasto')
    expect(html).not.toContain('Lucro')
    expect(html).not.toContain('Margem')
    expect(html).not.toContain('R$ 0,00')
  })

  it('prejuízo é legível como prejuízo: rótulo próprio, valor negativo e destaque', () => {
    const html = renderCost(
      buildValuation([buildLine({ marginAmount: '-25.5000', marginPercentage: '-2.5500' })]),
    )

    expect(html).toContain(financialsPt.documentCost.loss)
    expect(html).not.toContain('>Lucro<')
    expect(html).toContain('-R$ 25,50')
    expect(readFileSync(COST_COMPONENT, 'utf8')).toContain('isLoss ? styles.negative')
    expect(ruleBodyOf(readFileSync(STYLESHEET, 'utf8'), 'negative')).toContain('color:')
  })

  it('gasto e lucro têm cores diferentes: o que sai é vermelho, o que rende é verde', () => {
    const component = readFileSync(COST_COMPONENT, 'utf8')
    const stylesheet = readFileSync(STYLESHEET, 'utf8')
    const amountIn = ruleBodyOf(stylesheet, 'amountIn')
    const amountOut = ruleBodyOf(stylesheet, 'amountOut')

    // O CSS module não gera nome de classe no teste, então a cor é lida da fonte — e pela regra do
    // módulo, que é a mesma do razão: verde entra, vermelho sai.
    expect(amountIn).toContain('--color-ready')
    expect(amountOut).toContain('--color-alert')
    expect(amountIn).not.toBe(amountOut)
    expect(component).toContain("flow === 'in' ? styles.amountIn : styles.amountOut")
    expect(component).toContain('cn(styles.documentCostValue, styles.amountOut)')
    expect(component).toContain('<CostGroup figure={profitFigure} flow="in"')
    expect(component).toContain('<CostGroup figure={view.margin} flow="in"')
    expect(component).toMatch(/<CostGroup figure=\{view\.tax\} flow="out"/gu)
  })

  it('lucro positivo não leva o destaque de prejuízo', () => {
    const html = renderCost(buildValuation([buildLine()]))

    expect(html).not.toContain(financialsPt.documentCost.loss)
  })

  it('tempo parcial ou incompleto mostra o aviso; tempo completo não', () => {
    const partial = renderCost(buildValuation([buildLine({ timeBasis: 'partial' })]))
    const incomplete = renderCost(buildValuation([buildLine({ timeBasis: 'incomplete' })]))
    const complete = renderCost(buildValuation([buildLine()]))

    expect(partial).toContain(financialsPt.documentCost.timeBasis.partial)
    expect(incomplete).toContain(financialsPt.documentCost.timeBasis.incomplete)
    expect(complete).not.toContain('Tempo')
  })
})

describe('a fiação é por contexto, sem sexta prop no TripStopList (spec 232 T3.2)', () => {
  it('o gasto vive dentro de "Dados da nota", no corpo da nota aberta, nunca na linha sempre visível', () => {
    const stopList = readFileSync(STOP_LIST, 'utf8')
    const dataComponent = readFileSync(DATA_COMPONENT, 'utf8')
    const page = readFileSync(DETAIL_PAGE, 'utf8')
    const detailStart = stopList.indexOf('{isOpen ? (')
    const detailEnd = stopList.indexOf('</li>', detailStart)
    const data = '<TripDocumentData'

    expect(detailStart).toBeGreaterThan(-1)
    expect(stopList.split(data)).toHaveLength(2)
    expect(stopList.indexOf(data)).toBeGreaterThan(detailStart)
    expect(stopList.indexOf(data)).toBeLessThan(detailEnd)
    expect(dataComponent).toContain('<TripDocumentCost documentId={document.id} />')
    expect(dataComponent).toContain('<TripDocumentCostCriterion documentId={document.id} />')
    expect(readFileSync(DETAIL, 'utf8')).not.toContain('TripDocumentCostCriterion')
    expect(page).toContain('<DocumentCostProvider valuation={financials.valuation}>')
  })

  it('a nota que só tem figura de custo ainda abre a seção', () => {
    const dataComponent = readFileSync(DATA_COMPONENT, 'utf8')

    expect(dataComponent).toContain('const hasDocumentCost = useHasDocumentCost(document.id)')
    expect(dataComponent).toMatch(/&&\s*!hasDocumentCost\b/u)
  })

  it('as chaves novas existem nos dois locales', () => {
    for (const locale of [financialsPt, financialsEn]) {
      expect(locale.documentCost.loss).toBeString()
      expect(locale.documentCost.splitCriterion).toBeString()
    }
  })
})
