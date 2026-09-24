/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  ADVISORY_GAPS,
  buildValuationLedger,
  GAP_REMEDY,
  GapRemedy,
  STRUCK_THROUGH_GAPS,
} from '@/modules/trip-financials/shared/valuationLedger.service'
import type { TripValuation } from '@/modules/trip-financials/shared/tripValuation.service'

/**
 * O motivo da lacuna era texto morto — quem lia não sabia onde resolvê-la. `GAP_REMEDY`
 * liga a lacuna ao **remédio** (planejar rota, lançar gasto, declarar regime, abrir perfis de
 * emissão), nunca à tela: `ValuationLedger` é o mesmo componente na viagem, na prévia e na proposta,
 * e a proposta não tem as ações de viagem.
 */
function valuation(overrides: Partial<TripValuation> = {}): TripValuation {
  return {
    costParcels: [],
    hasGaps: true,
    marginPercentage: null,
    revenueLines: [],
    revenueSource: 'estimated',
    totalCost: '0.00',
    totalMargin: '0.00',
    totalRevenue: '0.00',
    ...overrides,
  }
}

function parcelWithGap(gap: string) {
  return {
    amount: '0.00',
    basis: null,
    detail: null,
    gap,
    kind: 'fuel',
    source: 'missing' as const,
  }
}

describe('o remédio da lacuna do razão de valoração', () => {
  it('liga as cinco lacunas ao remédio certo', () => {
    expect(GAP_REMEDY.NO_PLANNED_DISTANCE).toBe(GapRemedy.PLAN_ROUTE)
    expect(GAP_REMEDY.NO_PLANNED_DURATION).toBe(GapRemedy.PLAN_ROUTE)
    expect(GAP_REMEDY.NOT_RECORDED).toBe(GapRemedy.RECORD_COST)
    expect(GAP_REMEDY.NO_FEDERAL_REGIME).toBe(GapRemedy.FEDERAL_REGIME)
    expect(GAP_REMEDY.NO_EMISSION_PROFILE).toBe(GapRemedy.EMISSION_PROFILE)
  })

  /** Spec 060 não existe — a lacuna riscada nunca ganha ação. */
  it('FEATURE_ABSENT não tem remédio', () => {
    expect(GAP_REMEDY.FEATURE_ABSENT).toBeUndefined()
    expect(STRUCK_THROUGH_GAPS).toContain('FEATURE_ABSENT')

    const ledger = buildValuationLedger(
      valuation({ costParcels: [parcelWithGap('FEATURE_ABSENT')] }),
    )!

    expect(ledger.operating[0]?.remedy).toBeNull()
  })

  it('lacuna sem remédio cadastrado fica com remedy nulo — texto puro, não quebrado', () => {
    const ledger = buildValuationLedger(
      valuation({ costParcels: [parcelWithGap('NO_FUEL_CONSUMPTION')] }),
    )!

    expect(ledger.operating[0]?.remedy).toBeNull()
  })

  it('lacuna com remédio cadastrado sai com o remedy certo na linha', () => {
    const ledger = buildValuationLedger(
      valuation({ costParcels: [parcelWithGap('NOT_RECORDED')] }),
    )!

    expect(ledger.operating[0]?.remedy).toBe(GapRemedy.RECORD_COST)
  })

  /** Spec 124: aviso não pede ação — o número já está lá, ao lado do motivo. */
  it('lacuna advisory não recebe remedy mesmo estando no mapa', () => {
    expect(ADVISORY_GAPS).toContain('DRIVER_ZONE_PRICED_FROM_TABLE')
    expect(GAP_REMEDY.DRIVER_ZONE_PRICED_FROM_TABLE).toBeUndefined()

    const ledger = buildValuationLedger(
      valuation({
        costParcels: [
          {
            amount: '120.00',
            basis: null,
            detail: null,
            gap: 'DRIVER_ZONE_PRICED_FROM_TABLE',
            kind: 'driver',
            source: 'estimated',
          },
        ],
      }),
    )!

    expect(ledger.operating[0]?.isAdvisory).toBe(true)
    expect(ledger.operating[0]?.remedy).toBeNull()
  })

  it('sem lacuna a linha não tem remedy', () => {
    const ledger = buildValuationLedger(
      valuation({
        costParcels: [
          {
            amount: '100.00',
            basis: null,
            detail: null,
            gap: null,
            kind: 'toll',
            source: 'measured',
          },
        ],
        hasGaps: false,
      }),
    )!

    expect(ledger.operating[0]?.remedy).toBeNull()
  })
})
