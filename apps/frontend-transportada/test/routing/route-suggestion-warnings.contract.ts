/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  canDecideSuggestion,
  collectRouteSuggestionWarnings,
  hasPlottableStops,
  orderStopsForReview,
} from '../../src/modules/routing/shared/routeSuggestionWarnings.service'
import { READY_SUGGESTION, buildStop } from './routing.fixture'

describe('route suggestion warnings (spec 058 P1)', () => {
  test('says nothing when there is nothing to say', () => {
    expect(collectRouteSuggestionWarnings(READY_SUGGESTION)).toEqual([])
  })

  /**
   * Aceite da spec: a parada em centroide de município vem **destacada**. Ela é um palpite de ~8km,
   * e o conferente tem de ver isso na tela antes de aceitar, não descobrir pelo motorista.
   */
  test('flags the stop that only has a municipality centroid', () => {
    const warnings = collectRouteSuggestionWarnings({
      ...READY_SUGGESTION,
      stops: [
        buildStop({ sequence: 1 }),
        buildStop({ excludedFromOptimization: true, geocodingPrecision: 'city', sequence: 2 }),
        buildStop({ excludedFromOptimization: true, geocodingPrecision: 'city', sequence: 3 }),
      ],
    })

    expect(warnings).toContainEqual({ count: 2, kind: 'coarseGeocoding', total: null })
  })

  /** Nota sem peso entrou com o médio da empresa — e isso é estimativa, não medida. */
  test('flags an estimated weight, so nobody reads it as a measurement', () => {
    const warnings = collectRouteSuggestionWarnings({
      ...READY_SUGGESTION,
      stops: [buildStop({ sequence: 1, weightEstimated: true })],
    })

    expect(warnings).toContainEqual({ count: 1, kind: 'estimatedWeight', total: null })
  })

  /** A violação carrega a medida: "estourou" não diz ao conferente o que ele precisa decidir. */
  test('adds up how much each measured violation is off by', () => {
    const warnings = collectRouteSuggestionWarnings({
      ...READY_SUGGESTION,
      stops: [
        buildStop({
          sequence: 1,
          violations: [
            { amount: 400, kind: 'weight', stopIndex: 1, vehicleId: 'vehicle-1' },
            { amount: 900, kind: 'delivery_window', stopIndex: 1, vehicleId: 'vehicle-1' },
          ],
        }),
        buildStop({
          sequence: 2,
          violations: [{ amount: 200, kind: 'weight', stopIndex: 2, vehicleId: 'vehicle-1' }],
        }),
      ],
    })

    expect(warnings).toContainEqual({ count: 2, kind: 'weight', total: 600 })
    expect(warnings).toContainEqual({ count: 1, kind: 'deliveryWindow', total: 900 })
  })

  /** Contagem sem medida não inventa um `total: 0`, que pareceria uma medição feita e zerada. */
  test('leaves the total empty for the warnings that are a count, not a measure', () => {
    const warnings = collectRouteSuggestionWarnings({
      ...READY_SUGGESTION,
      stops: [buildStop({ excludedFromOptimization: true, sequence: 1 })],
    })

    expect(warnings[0]?.total).toBeNull()
  })

  /**
   * O que impede a rota de existir vem antes do que a torna cara: parada sem estrada, depois peso
   * que não cabe, e só então as violações de tempo — reais, mas cumpríveis com atraso.
   */
  test('ranks what makes the route impossible above what makes it expensive', () => {
    const warnings = collectRouteSuggestionWarnings({
      ...READY_SUGGESTION,
      truncated: true,
      stops: [
        buildStop({
          sequence: 1,
          violations: [
            { amount: 600, kind: 'duty_time', stopIndex: null, vehicleId: 'vehicle-1' },
            { amount: 1, kind: 'unreachable', stopIndex: 1, vehicleId: 'vehicle-1' },
            { amount: 300, kind: 'weight', stopIndex: null, vehicleId: 'vehicle-1' },
          ],
        }),
      ],
    })

    expect(warnings.map((warning) => warning.kind)).toEqual([
      'unreachable',
      'weight',
      'dutyTime',
      'truncated',
    ])
  })

  /** Uma sugestão cortada que não diz que foi cortada convida a confiar demais nela. */
  test('says the answer was truncated, which is about the whole suggestion', () => {
    const warnings = collectRouteSuggestionWarnings({ ...READY_SUGGESTION, truncated: true })

    expect(warnings).toEqual([{ count: 1, kind: 'truncated', total: null }])
  })
})

describe('review ordering (ADR-0044 §5)', () => {
  /**
   * A parada fora da otimização vai para o fim. Intercalá-la entre as otimizadas sugeriria uma ordem
   * que o solver não escolheu — e é justamente a ordem que o conferente está conferindo.
   */
  test('pushes the un-optimized stop to the end instead of interleaving it', () => {
    const ordered = orderStopsForReview([
      buildStop({ label: 'B', sequence: 2 }),
      buildStop({ excludedFromOptimization: true, label: 'palpite', sequence: 1 }),
      buildStop({ label: 'A', sequence: 1 }),
    ])

    expect(ordered.map((stop) => stop.label)).toEqual(['A', 'B', 'palpite'])
  })
})

describe('deciding a suggestion (ADR-0044 §5)', () => {
  /** Aceitar uma `stale` aplicaria o roteiro de uma viagem que já mudou. */
  test('only a ready suggestion can be decided', () => {
    expect(canDecideSuggestion(READY_SUGGESTION)).toBe(true)

    for (const status of [
      'queued',
      'running',
      'accepted',
      'rejected',
      'stale',
      'failed',
    ] as const) {
      expect(canDecideSuggestion({ ...READY_SUGGESTION, status })).toBe(false)
    }
  })
})

describe('plottable stops (ADR-0044 §6)', () => {
  /** O mapa confere a sugestão; ele não é a sugestão. Sem coordenada não há o que desenhar. */
  test('knows when there is nothing to draw', () => {
    expect(hasPlottableStops(READY_SUGGESTION)).toBe(true)
    expect(
      hasPlottableStops({
        ...READY_SUGGESTION,
        stops: [buildStop({ latitude: null, longitude: null, sequence: 1 })],
      }),
    ).toBe(false)
  })
})
