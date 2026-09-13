/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  ADVISORY_GAPS,
  buildTripValuation,
  STAGE_GAPS,
  VALUATION_GAPS,
  type TripCostParcel,
} from '../../src/trips/domain/trip-valuation.policy.js'

function parcel(overrides: Partial<TripCostParcel>): TripCostParcel {
  return {
    amount: '100.0000',
    detail: null,
    gap: null,
    kind: 'fuel',
    source: 'estimated',
    ...overrides,
  }
}

const TOLL_IN_SUGGESTION = parcel({
  amount: '0.0000',
  gap: VALUATION_GAPS.tollNotAvailableInSuggestion,
  kind: 'toll',
  source: 'missing',
})

describe('lacuna de etapa', () => {
  /**
   * O pedágio da sugestão não falta por cadastro: ele só existe depois da viagem criada. É a única
   * lacuna que o operador não resolve na tela da proposta.
   */
  it('a lista de etapa é só o pedágio da sugestão', () => {
    expect([...STAGE_GAPS]).toEqual(['TOLL_NOT_AVAILABLE_IN_SUGGESTION'])
  })

  it('lacuna de etapa não é aviso: as duas listas não se cruzam', () => {
    expect(STAGE_GAPS.filter((gap) => ADVISORY_GAPS.includes(gap))).toEqual([])
  })

  /**
   * ⚠️ O total sem pedágio subestima o custo. `hasGaps` continua verdadeiro para que o total saiba
   * disso — quem troca o rótulo é a tela da proposta, não a conta.
   */
  it('só com a lacuna de etapa a conta continua sabendo que subestima', () => {
    const valuation = buildTripValuation({
      costParcels: [parcel({}), TOLL_IN_SUGGESTION],
      revenueLines: [],
    })

    expect(valuation.hasGaps).toBe(true)
    expect(valuation.totalCost).toBe('100.0000')
  })
})
