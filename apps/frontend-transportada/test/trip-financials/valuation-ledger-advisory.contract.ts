/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  ADVISORY_GAPS,
  buildValuationLedger,
} from '@/modules/trip-financials/shared/valuationLedger.service'
import type { TripValuation } from '@/modules/trip-financials/shared/tripValuation.service'

/**
 * Spec 124 — **aviso não esconde o número.** A lacuna-aviso `DRIVER_ZONE_PRICED_FROM_TABLE` tem valor
 * que conta no total; o razão escondia o valor de toda linha com lacuna, e a tela passaria a somar um
 * número que não imprime. E projeção sai marcada: `source: 'estimated'` imprime a marca.
 */
const API_POLICY = '../../../api-transportada/src/trips/domain/trip-valuation.policy.ts'

function apiAdvisoryGaps(): readonly string[] {
  const source = readFileSync(new URL(API_POLICY, import.meta.url), 'utf8')
  const gaps = source.slice(source.indexOf('export const VALUATION_GAPS'))
  const names = new Map(
    [...gaps.matchAll(/^\s+(\w+): '([A-Z_]+)',$/gm)].map((match) => [match[1], match[2]]),
  )
  const block = source.slice(source.indexOf('export const ADVISORY_GAPS'))
  /** `= [` e não `[`: o tipo `readonly ValuationGap[]` vem antes da lista na mesma linha. */
  const start = block.indexOf('= [')
  const list = block.slice(start, block.indexOf(']', start))

  return [...list.matchAll(/VALUATION_GAPS\.(\w+)/g)].map((match) => names.get(match[1]) ?? '')
}

const COMPONENT = '../../src/modules/trip-financials/components/ValuationLedger.component.tsx'

function valuation(): TripValuation {
  return {
    costParcels: [
      {
        amount: '621.0000',
        basis: {
          of: 'driver',
          paymentModel: 'route_table',
          regionCity: 'CAJURU',
          regionCode: '3.000',
          vehicleClass: 'vuc',
        },
        detail: '3.000 (CAJURU) · vuc',
        gap: 'DRIVER_ZONE_PRICED_FROM_TABLE',
        kind: 'driver',
        source: 'measured',
      },
      {
        amount: '0.0000',
        basis: null,
        detail: null,
        gap: 'NO_FEDERAL_REGIME',
        kind: 'pis_cofins',
        source: 'missing',
      },
    ],
    hasGaps: false,
    marginPercentage: null,
    revenueLines: [],
    revenueSource: 'estimated',
    totalCost: '621.0000',
    totalMargin: '-621.0000',
    totalRevenue: '0.0000',
  }
}

describe('valuation ledger advisory (spec 124)', () => {
  test('the advisory list is a copy by value of the API one', () => {
    /** Spec 128: o empate de rotas com o maior valor também é aviso — o número está completo. */
    expect(apiAdvisoryGaps()).toEqual([
      'DRIVER_ZONE_PRICED_FROM_TABLE',
      'DRIVER_ROUTE_TIE_HIGHEST_RATE',
    ])
    expect([...ADVISORY_GAPS]).toEqual([...apiAdvisoryGaps()])
  })

  test('an advisory line keeps its amount, and carries the advice', () => {
    const driver = buildValuationLedger(valuation())?.operating.find(
      (line) => line.kind === 'driver',
    )

    expect(driver?.amount).toBe('621.0000')
    expect(driver?.isAdvisory).toBe(true)
    expect(driver?.gap).toBe('DRIVER_ZONE_PRICED_FROM_TABLE')
    /** Spec 127: a ficha do motorista não muda a origem — o preço da tabela é medido, e o aviso fica. */
    expect(driver?.isEstimated).toBe(false)
  })

  test('a real gap still takes the place of the number', () => {
    const federal = buildValuationLedger(valuation())?.taxes[0]

    expect(federal?.amount).toBeNull()
    expect(federal?.isAdvisory).toBe(false)
  })

  /** A soma conferível conta o valor do aviso — ele está no total da API. */
  test('the ledger sum counts the advisory amount', () => {
    expect(buildValuationLedger(valuation())?.sum).toBe('621.0000')
  })

  test('the component prints the estimated mark and the advice next to the amount', () => {
    const source = readFileSync(new URL(COMPONENT, import.meta.url), 'utf8')

    expect(source).toContain("t('source.estimated')")
    expect(source).toContain('line.isEstimated')
    expect(source).toContain('line.isAdvisory')
  })
})
