/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 149 T14 — a diária do ajudante chega à conta da viagem: a parcela `helper` que a API grava
 * em `TRIP_COST_KINDS` tem rótulo, entra na soma e, quando falta diária de um ajudante, a frase de
 * detalhe é composta aqui (a API manda `detail: "1/2"` cru).
 */
import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { ValuationLedger } from '@/modules/trip-financials/components/ValuationLedger.component'
import financialsEn from '@/modules/trip-financials/locales/tripFinancials.en.locale.json'
import financialsPt from '@/modules/trip-financials/locales/tripFinancials.locale.json'
import { FINANCIAL_PARCEL_KINDS } from '@/modules/trip-financials/shared/tripFinancials.types'
import type { TripValuation } from '@/modules/trip-financials/shared/tripValuation.service'
import { buildValuationLedger } from '@/modules/trip-financials/shared/valuationLedger.service'

const API_POLICY = '../../../api-transportada/src/trips/domain/trip-valuation.policy.ts'
const API_FINANCIAL_SCHEMA = '../../../api-transportada/src/database/trip-financial.schema.ts'

function apiKindList(file: string, constantName: string): readonly string[] {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const start = source.indexOf(`export const ${constantName}`)
  const block = source.slice(start, source.indexOf('] as const', start))

  return [...block.matchAll(/^\s+'([a-z_]+)',$/gm)].map((match) => match[1] ?? '')
}

function valuationWithHelper(
  helper: Partial<TripValuation['costParcels'][number]> = {},
): TripValuation {
  return {
    costParcels: [
      { amount: '413.79', basis: null, detail: null, gap: null, kind: 'fuel', source: 'measured' },
      {
        amount: '540.00',
        basis: null,
        detail: null,
        gap: null,
        kind: 'helper',
        source: 'measured',
        ...helper,
      },
    ],
    hasGaps: false,
    marginPercentage: null,
    revenueLines: [],
    revenueSource: 'estimated',
    totalCost: '953.79',
    totalMargin: '3046.21',
    totalRevenue: '4000.00',
  }
}

describe('parcela do ajudante na conta da viagem (spec 149 T14)', () => {
  it('a lista de parcelas do resultado congelado é cópia por valor da API', () => {
    expect([...FINANCIAL_PARCEL_KINDS]).toEqual([
      ...apiKindList(API_FINANCIAL_SCHEMA, 'TRIP_FINANCIAL_PARCEL_KINDS'),
    ])
    expect(FINANCIAL_PARCEL_KINDS).toContain('helper')
  })

  it('todo custo que a valoração da API calcula tem rótulo nos dois idiomas', () => {
    for (const kind of apiKindList(API_POLICY, 'TRIP_COST_KINDS')) {
      expect(Object.keys(financialsPt.parcel)).toContain(kind)
      expect(Object.keys(financialsEn.parcel)).toContain(kind)
    }
  })

  it('a linha "Ajudantes" entra na operação e a soma das linhas bate com o total', () => {
    const ledger = buildValuationLedger(valuationWithHelper())!

    expect(ledger.operating.map((line) => line.kind)).toEqual(['helper', 'fuel'])
    expect(ledger.sum).toBe('953.79')
  })

  it('o razão imprime o rótulo e o valor da diária', () => {
    const markup = renderToStaticMarkup(<ValuationLedger valuation={valuationWithHelper()} />)

    expect(markup).toContain(financialsPt.parcel.helper)
    expect(markup).toContain('540,00')
  })

  it('diária faltando em parte da equipe vira frase, nunca "1/2" cru', () => {
    const markup = renderToStaticMarkup(
      <ValuationLedger
        valuation={valuationWithHelper({
          detail: '1/2',
          gap: 'HELPER_DAILY_RATE_MISSING',
          source: 'measured',
        })}
      />,
    )

    expect(markup).toContain(financialsPt.gap.HELPER_DAILY_RATE_MISSING)
    expect(markup).toContain('1 de 2 ajudantes sem diária')
    expect(markup).not.toContain('— 1/2')
  })
})
