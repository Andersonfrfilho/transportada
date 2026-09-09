/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { RouteSuggestionStop } from '@/modules/routing/shared/routeSuggestion.types'
import {
  countLeftoverByReason,
  LEFTOVER_REASON,
  resolveLeftoverStops,
} from '@/modules/routing/shared/suggestionLeftover.service'

function stop(overrides: Partial<RouteSuggestionStop>): RouteSuggestionStop {
  return {
    addressKey: 'chave',
    distanceFromPreviousMeters: null,
    durationFromPreviousSeconds: null,
    estimatedArrivalAt: null,
    excludedFromOptimization: false,
    geocodingPrecision: null,
    label: 'Parada',
    latitude: null,
    longitude: null,
    sequence: 1,
    serviceTimeSampleSize: null,
    serviceTimeSeconds: null,
    serviceTimeSource: null,
    stopId: null,
    vehicleId: 'vehicle-1',
    violations: [],
    weightEstimated: false,
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
      { excludedFromOptimization: false, label: 'Orlândia', reason: LEFTOVER_REASON.notCovered },
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
      { excludedFromOptimization: false, label: 'a', reason: LEFTOVER_REASON.notCovered },
      { excludedFromOptimization: false, label: 'b', reason: LEFTOVER_REASON.notCovered },
      { excludedFromOptimization: true, label: 'c', reason: LEFTOVER_REASON.imprecise },
    ])

    expect(counts.get(LEFTOVER_REASON.notCovered)).toBe(2)
    expect(counts.get(LEFTOVER_REASON.imprecise)).toBe(1)
  })
})
