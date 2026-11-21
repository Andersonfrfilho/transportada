/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325, fase 4 da adoção do SDK: o adaptador do rateio traduz viagem → unidade e veículo → bem, e todo critério,
 * grupo e motivo da transportada tem ida e volta com o vocabulário do pacote. Sem isso, um nome novo de um lado
 * quebraria em silêncio do outro.
 */
import { ALLOCATION_CRITERIA } from '@adatechnology/expense-contracts'
import { describe, expect, it } from 'bun:test'

import {
  ALLOCATION_TRANSLATION,
  type AllocationCriterion,
} from '../../src/expenses/domain/expense-allocation.policy.js'

const LOCAL_CRITERIA: readonly AllocationCriterion[] = [
  'equal',
  'per_km',
  'per_revenue',
  'per_trip_day',
]

describe('expense allocation: tradução para o SDK', () => {
  it('todo critério da transportada traduz para um do pacote e volta ao mesmo', () => {
    for (const criterion of LOCAL_CRITERIA) {
      const sdk = ALLOCATION_TRANSLATION.criterionToSdk[criterion]
      expect(ALLOCATION_CRITERIA).toContain(sdk)
      expect(ALLOCATION_TRANSLATION.criterionFromSdk[sdk]).toBe(criterion)
    }
  })

  it('todo critério do pacote tem equivalente na transportada', () => {
    for (const sdk of ALLOCATION_CRITERIA) {
      expect(LOCAL_CRITERIA).toContain(ALLOCATION_TRANSLATION.criterionFromSdk[sdk])
    }
  })

  it('os quatro grupos de custo e os dois motivos traduzem nos dois sentidos', () => {
    expect(Object.keys(ALLOCATION_TRANSLATION.costGroupToSdk).sort()).toEqual([
      'administrative',
      'in_trip',
      'per_km',
      'vehicle_fixed',
    ])
    expect(Object.keys(ALLOCATION_TRANSLATION.reasonFromSdk).sort()).toEqual([
      'asset_without_units',
      'no_unit_weight',
    ])
  })
})
