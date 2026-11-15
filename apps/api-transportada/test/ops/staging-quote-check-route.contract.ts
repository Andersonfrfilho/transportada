/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { reconstructFrozenRoute } from '../../scripts/staging-quote-check.route.js'
import type { FrozenPlannedRoute } from '../../src/trips/application/freeze-trip-planned-route.use-case.js'

/** O formato que `freezeTripPlannedRoute` grava em `trips.planned_route` (tipado pelo próprio escritor). */
function frozenRoute(input: {
  readonly leadingLegs: number
  readonly legMeters: readonly number[]
  readonly trailingLegs: number
}): FrozenPlannedRoute {
  return {
    choiceReproduced: true,
    criterion: 'fastest',
    depot: {
      absence: null,
      description: null,
      leadingLegs: input.leadingLegs,
      origin: { latitude: '-21.1700000', longitude: '-47.8100000' },
      originSource: null,
      trailingLegs: input.trailingLegs,
    },
    distanceMeters: input.legMeters.reduce((sum, meters) => sum + meters, 0),
    durationSeconds: 100,
    isNoToll: false,
    // O traçado tem centenas de pontos: nunca é a lista de waypoints.
    legs: input.legMeters.map((distanceMetres) => ({ distanceMetres, durationSeconds: 10 })),
    points: Array.from({ length: 400 }, (_, index) => ({
      latitude: `-21.${index}`,
      longitude: `-47.${index}`,
    })),
    returnDistanceMeters: 0,
    signature: null,
  } as unknown as FrozenPlannedRoute
}

const STOPS = [
  { latitude: '-21.2000000', longitude: '-47.8000000' },
  { latitude: '-21.3000000', longitude: '-47.7000000' },
  { latitude: '-21.4000000', longitude: '-47.6000000' },
] as const

describe('conferência da cotação por endereço: reconstrução da rota congelada', () => {
  test('com barracão nas duas pontas, a rota é barracão, paradas e barracão, mesmo com 400 pontos de traçado', () => {
    const route = frozenRoute({
      leadingLegs: 1,
      legMeters: [5000, 7000, 9000, 6000],
      trailingLegs: 1,
    })
    const result = reconstructFrozenRoute({ plannedRoute: route, stops: STOPS })
    if ('reason' in result) throw new Error(result.reason)
    expect(result.waypoints).toHaveLength(5)
    expect(result.waypoints[0]).toEqual({ latitude: '-21.1700000', longitude: '-47.8100000' })
    expect(result.waypoints[4]).toEqual({ latitude: '-21.1700000', longitude: '-47.8100000' })
    expect(result.waypoints.slice(1, 4)).toEqual([...STOPS])
    expect(result.frozenLegMeters).toEqual([5000, 7000, 9000, 6000])
    expect(result.criterion).toBe('fastest')
  })

  test('sem barracão, a rota são só as paradas', () => {
    const route = frozenRoute({ leadingLegs: 0, legMeters: [7000, 9000], trailingLegs: 0 })
    const result = reconstructFrozenRoute({ plannedRoute: route, stops: STOPS })
    if ('reason' in result) throw new Error(result.reason)
    expect(result.waypoints).toEqual([...STOPS])
  })

  test('só com saída (sem retorno), o barracão entra só na frente', () => {
    const route = frozenRoute({ leadingLegs: 1, legMeters: [5000, 7000, 9000], trailingLegs: 0 })
    const result = reconstructFrozenRoute({ plannedRoute: route, stops: STOPS })
    if ('reason' in result) throw new Error(result.reason)
    expect(result.waypoints).toHaveLength(4)
  })

  test('quando os trechos não fecham, diz o motivo em vez de adivinhar', () => {
    const route = frozenRoute({ leadingLegs: 1, legMeters: [5000, 7000], trailingLegs: 1 })
    const result = reconstructFrozenRoute({ plannedRoute: route, stops: STOPS })
    expect('reason' in result && result.reason).toContain('trechos_nao_fecham')
  })

  test('rota ilegível ou ausente não quebra', () => {
    expect(reconstructFrozenRoute({ plannedRoute: null, stops: STOPS })).toEqual({
      reason: 'rota_ilegivel',
    })
  })
})
