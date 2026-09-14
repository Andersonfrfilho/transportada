/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { fractionToPercentage } from '@/modules/shared/fractionPercentage.service'
import { toTripValuation } from '@/modules/trip-financials/shared/tripValuationResponse.validation'

import financialsEn from '../../src/modules/trip-financials/locales/tripFinancials.en.locale.json'
import financialsPt from '../../src/modules/trip-financials/locales/tripFinancials.locale.json'

/**
 * Spec 125 — **o ICMS projetado diz de onde veio.** A API sobe o CST e as duas frações do perfil de
 * emissão como insumo cru; a frase é da tela, e ela diz que o CT-e autorizado substitui o número.
 */
const COMPONENT = '../../src/modules/trip-financials/components/ValuationLedger.component.tsx'

describe('ICMS projection basis (spec 125)', () => {
  test('the icms basis is read by shape', () => {
    const valuation = toTripValuation({
      data: {
        costParcels: [
          {
            amount: '120.0000',
            basis: { baseReductionRate: '0.200000', cst: '20', of: 'icms', rate: '0.120000' },
            detail: null,
            gap: null,
            kind: 'icms',
            source: 'estimated',
          },
        ],
        hasGaps: false,
        marginPercentage: null,
        revenueLines: [],
        revenueSource: 'estimated',
        totalCost: '120.0000',
        totalMargin: '0.0000',
        totalRevenue: '0.0000',
      },
    })

    expect(valuation?.costParcels[0]?.basis).toEqual({
      baseReductionRate: '0.200000',
      cst: '20',
      of: 'icms',
      rate: '0.120000',
    })
  })

  /** Fração da API, percentual na tela — conversão textual, nunca por `Number`. */
  test('fractions turn into percentages without floating point', () => {
    expect(fractionToPercentage('0.120000')).toBe('12.0000')
    expect(fractionToPercentage('0.0065')).toBe('0.6500')
    expect(fractionToPercentage('0')).toBe('0.0000')
    expect(fractionToPercentage('0.076')).toBe('7.6000')
  })

  test('the ledger composes the icms sentence in both languages', () => {
    const source = readFileSync(new URL(COMPONENT, import.meta.url), 'utf8')

    expect(source).toContain("basis.of === 'icms'")
    expect(source).toContain("'ledger.icmsBasis'")
    expect(financialsPt.ledger.icmsBasis).toContain('{{cst}}')
    expect(financialsEn.ledger.icmsBasis).toContain('{{cst}}')
  })
})
