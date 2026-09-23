/**
 * Copyright (c) 2026 Ada Technology. MIT License.

 * Assere sobre o **renderizado** (`renderToStaticMarkup`, i18n real), no molde de
 * `test/fleet/toll-booth-charge-panel-render.contract.tsx` — `ValuationLedger` não usa portal nem
 * efeito que dependa de DOM.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import {
  ValuationLedger,
  type GapAction,
} from '@/modules/trip-financials/components/ValuationLedger.component'
import { GapRemedy } from '@/modules/trip-financials/shared/valuationLedger.service'
import type { TripValuation } from '@/modules/trip-financials/shared/tripValuation.service'
import tripFinancialsLocale from '@/modules/trip-financials/locales/tripFinancials.locale.json'

function valuationWithGap(gap: string): TripValuation {
  return {
    costParcels: [
      { amount: '0.00', basis: null, detail: null, gap, kind: 'fuel', source: 'missing' },
    ],
    hasGaps: true,
    marginPercentage: null,
    revenueLines: [],
    revenueSource: 'estimated',
    totalCost: '0.00',
    totalMargin: '0.00',
    totalRevenue: '4000.00',
  }
}

describe('ação da lacuna no razão de valoração', () => {
  /**
   * ⚠️ A proposta multi-veículo e a criação manual não passam `gapActions` — o motivo continua
   * texto puro, exatamente como antes.
   */
  it('sem gapActions o motivo é texto puro (proposta intacta)', () => {
    const markup = renderToStaticMarkup(
      <ValuationLedger valuation={valuationWithGap('NOT_RECORDED')} />,
    )

    expect(markup).toContain(tripFinancialsLocale.gap.NOT_RECORDED)
    expect(markup).not.toContain('<button')
  })

  it('com gapActions e remédio cadastrado, o motivo vira botão', () => {
    const gapActions: Partial<Record<GapRemedy, GapAction>> = {
      [GapRemedy.RECORD_COST]: { onAct: () => {} },
    }
    const markup = renderToStaticMarkup(
      <ValuationLedger gapActions={gapActions} valuation={valuationWithGap('NOT_RECORDED')} />,
    )

    expect(markup).toContain('<button')
    expect(markup).toContain(tripFinancialsLocale.gap.NOT_RECORDED)
    expect(markup).toContain(tripFinancialsLocale.gapAction.recordCost)
  })

  it('com gapActions mas sem remédio para aquela lacuna, o motivo continua texto', () => {
    const gapActions: Partial<Record<GapRemedy, GapAction>> = {
      [GapRemedy.RECORD_COST]: { onAct: () => {} },
    }
    const markup = renderToStaticMarkup(
      <ValuationLedger
        gapActions={gapActions}
        valuation={valuationWithGap('NO_FUEL_CONSUMPTION')}
      />,
    )

    expect(markup).not.toContain('<button')
  })

  /** Spec 060 não existe — FEATURE_ABSENT jamais ganha ação, mesmo com gapActions completo. */
  it('FEATURE_ABSENT nunca ganha ação', () => {
    const gapActions: Partial<Record<GapRemedy, GapAction>> = {
      [GapRemedy.EMISSION_PROFILE]: { onAct: () => {} },
      [GapRemedy.FEDERAL_REGIME]: { onAct: () => {} },
      [GapRemedy.PLAN_ROUTE]: { onAct: () => {} },
      [GapRemedy.RECORD_COST]: { onAct: () => {} },
    }
    const markup = renderToStaticMarkup(
      <ValuationLedger gapActions={gapActions} valuation={valuationWithGap('FEATURE_ABSENT')} />,
    )

    expect(markup).not.toContain('<button')
  })
})
