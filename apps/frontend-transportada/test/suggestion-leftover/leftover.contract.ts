/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  collectRetryableDocumentIds,
  countLeftoverByReason,
  LEFTOVER_REASON,
  resolveLeftoverStops,
  type CoverableSuggestionStop,
} from '@/modules/routing/shared/suggestionLeftover.service'

function stop(overrides: Partial<CoverableSuggestionStop>): CoverableSuggestionStop {
  return {
    excludedFromOptimization: false,
    label: 'Parada',
    nfeDocumentIds: [],
    vehicleId: 'vehicle-1',
    ...overrides,
  }
}

describe('a sobra da roteirização (spec 107)', () => {
  /**
   * ⚠️ Sugestão que devolve quarenta paradas e cala sobre doze **parece completa**. O operador
   * aceita, e descobre a carga esquecida no dia seguinte.
   */
  it('a parada sem veículo é sobra', () => {
    const leftovers = resolveLeftoverStops([
      stop({ label: 'Ribeirão Preto' }),
      stop({ label: 'Orlândia', vehicleId: null }),
    ])

    expect(leftovers).toEqual([
      {
        excludedFromOptimization: false,
        label: 'Orlândia',
        nfeDocumentIds: [],
        reason: LEFTOVER_REASON.notCovered,
      },
    ])
  })

  /** As duas causas pedem ações diferentes: cadastrar zona, ou corrigir o endereço. */
  it('separa cobertura de coordenada imprecisa', () => {
    const leftovers = resolveLeftoverStops([
      stop({ excludedFromOptimization: true, label: 'Sem CEP', vehicleId: null }),
      stop({ label: 'Ipuã', vehicleId: null }),
    ])

    expect(leftovers.map((entry) => entry.reason)).toEqual([
      LEFTOVER_REASON.imprecise,
      LEFTOVER_REASON.notCovered,
    ])
  })

  it('sem sobra, lista vazia', () => {
    expect(resolveLeftoverStops([stop({}), stop({})])).toEqual([])
  })

  it('conta por causa, para a frase', () => {
    const counts = countLeftoverByReason([
      {
        excludedFromOptimization: false,
        label: 'a',
        nfeDocumentIds: [],
        reason: LEFTOVER_REASON.notCovered,
      },
      {
        excludedFromOptimization: false,
        label: 'b',
        nfeDocumentIds: [],
        reason: LEFTOVER_REASON.notCovered,
      },
      {
        excludedFromOptimization: true,
        label: 'c',
        nfeDocumentIds: [],
        reason: LEFTOVER_REASON.imprecise,
      },
    ])

    expect(counts.get(LEFTOVER_REASON.notCovered)).toBe(2)
    expect(counts.get(LEFTOVER_REASON.imprecise)).toBe(1)
  })
})

describe('as notas que voltam para a seleção (spec 107 D3)', () => {
  /**
   * ⚠️ Só a sobra **sem cobertura** volta. A parada excluída por endereço impreciso não fica melhor
   * numa segunda montagem — reoferecê-la faria o operador repetir o mesmo pedido esperando resultado
   * diferente.
   */
  it('devolve só as notas das paradas sem cobertura', () => {
    const leftovers = resolveLeftoverStops([
      stop({ label: 'Ipuã', nfeDocumentIds: ['a', 'b'], vehicleId: null }),
      stop({
        excludedFromOptimization: true,
        label: 'Sem CEP',
        nfeDocumentIds: ['c'],
        vehicleId: null,
      }),
    ])

    expect(collectRetryableDocumentIds(leftovers)).toEqual(['a', 'b'])
  })

  /** A mesma nota em duas paradas volta uma vez: a seleção é um conjunto. */
  it('não repete nota', () => {
    const leftovers = resolveLeftoverStops([
      stop({ label: 'Ipuã', nfeDocumentIds: ['a'], vehicleId: null }),
      stop({ label: 'Orlândia', nfeDocumentIds: ['a', 'b'], vehicleId: null }),
    ])

    expect(collectRetryableDocumentIds(leftovers)).toEqual(['a', 'b'])
  })

  it('sem sobra sem cobertura, nada volta', () => {
    expect(collectRetryableDocumentIds([])).toEqual([])
  })
})
