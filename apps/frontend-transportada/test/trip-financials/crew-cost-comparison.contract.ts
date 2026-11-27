/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  TripFinancialResponseError,
  toCrewCostComparison,
} from '@/modules/trip-financials/shared/tripFinancialsResponse.validation'

const ROW = {
  calculatedAmount: '200.00',
  calculatedHasGaps: false,
  createdAt: '2026-11-26T10:00:00.000Z',
  crewNames: ['Andréia Ulisses Procopio'],
  differenceAmount: '50.00',
  informedAmount: '250.00',
  informedHasGaps: false,
  informedPeople: 1,
  status: 'draft',
  tripId: '00000000-0000-4000-8000-000000000001',
}

/** Spec 327: a resposta da comparação gasto × custo é entrada não confiável. */
describe('a comparação gasto × custo da tripulação (spec 327)', () => {
  it('lê a linha da API sem mexer nos valores', () => {
    expect(toCrewCostComparison({ data: { items: [ROW], truncated: true } })).toEqual({
      items: [ROW],
      truncated: true,
    })
  })

  it('aceita o período sem viagens', () => {
    expect(toCrewCostComparison({ data: { items: [] } })).toEqual({ items: [], truncated: false })
  })

  it('recusa resposta sem a lista ou com valor que não é texto', () => {
    expect(() => toCrewCostComparison({ data: {} })).toThrow(TripFinancialResponseError)
    expect(() =>
      toCrewCostComparison({ data: { items: [{ ...ROW, informedAmount: 250 }] } }),
    ).toThrow(TripFinancialResponseError)
  })
})
