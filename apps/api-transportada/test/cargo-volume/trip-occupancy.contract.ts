/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  TRIP_OCCUPANCY_SOURCE,
  resolveTripOccupancy,
} from '../../src/trips/domain/trip-occupancy.policy.js'

const CAPACIDADE = { capacityM3: '10.030000' }

describe('ocupação da viagem (spec 075 P3/RF4)', () => {
  test('soma a cubagem das notas e divide pela capacidade', () => {
    const resolved = resolveTripOccupancy({
      ...CAPACIDADE,
      documents: [
        { source: 'estimated', volumeM3: '1.000000' },
        { source: 'estimated', volumeM3: '2.000000' },
      ],
    })

    expect(resolved).toMatchObject({
      loadedM3: '3.000000',
      occupancyRatio: '0.2991',
      source: TRIP_OCCUPANCY_SOURCE.estimated,
    })
  })

  /**
   * ⚠️ Uma nota estimada torna **o total** estimado. A tela não pode imprimir um número com cara de
   * medido só porque a maioria das parcelas era medida — quem carrega decide com o pior caso.
   */
  test('uma nota estimada torna o total estimado', () => {
    const resolved = resolveTripOccupancy({
      ...CAPACIDADE,
      documents: [
        { source: 'declared', volumeM3: '4.000000' },
        { source: 'estimated', volumeM3: '1.000000' },
      ],
    })

    expect(resolved?.source).toBe(TRIP_OCCUPANCY_SOURCE.estimated)
  })

  test('só notas declaradas mantêm o total declarado', () => {
    const resolved = resolveTripOccupancy({
      ...CAPACIDADE,
      documents: [{ source: 'declared', volumeM3: '4.000000' }],
    })

    expect(resolved?.source).toBe(TRIP_OCCUPANCY_SOURCE.declared)
  })

  /**
   * ⚠️ Denominador ausente **não vira 100%**, e não vira zero: vira ausência. Um veículo sem
   * capacidade conhecida com carga dentro é exatamente o caso em que um número inventado faria
   * alguém parar de carregar — ou continuar.
   */
  test('sem capacidade, não há ocupação — nunca 100%', () => {
    const resolved = resolveTripOccupancy({
      capacityM3: null,
      documents: [{ source: 'estimated', volumeM3: '3.000000' }],
    })

    expect(resolved).toBeNull()
  })

  /** Viagem vazia é 0% de verdade: a capacidade existe e a carga é nenhuma. */
  test('viagem sem nota é zero, não ausência', () => {
    const resolved = resolveTripOccupancy({ ...CAPACIDADE, documents: [] })

    expect(resolved).toMatchObject({ loadedM3: '0.000000', occupancyRatio: '0.0000' })
  })

  /** Nota sem cubagem não conta como zero: ela é dita à parte, para não sumir da conferência. */
  test('nota sem cubagem é contada à parte, nunca como zero', () => {
    const resolved = resolveTripOccupancy({
      ...CAPACIDADE,
      documents: [
        { source: 'estimated', volumeM3: '1.000000' },
        { source: null, volumeM3: null },
      ],
    })

    expect(resolved).toMatchObject({ documentsWithoutVolume: 1, loadedM3: '1.000000' })
  })

  /** Acima de 100% é exibido como está: passar do limite é informação, não erro a esconder. */
  test('estouro passa de 100% sem ser truncado', () => {
    const resolved = resolveTripOccupancy({
      capacityM3: '3.090000',
      documents: [{ source: 'estimated', volumeM3: '6.180000' }],
    })

    expect(resolved?.occupancyRatio).toBe('2.0000')
  })
})
