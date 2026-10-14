/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createTripStopPointResolver } from '../../src/trips/application/resolve-trip-stop-points.use-case.js'
import { planTripRoute } from '../../src/trips/application/plan-trip-route.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'

const INPUT = { actorUserId: 'user-1', companyId: 'company-1', tripId: 'trip-1' }

function createResolver(overrides: {
  keys?: readonly string[]
  limit?: number
  maxPerPlan?: number
  refine?: (input: { addressKey: string }) => Promise<unknown>
  used?: number
}) {
  const refined: string[] = []
  const resolver = createTripStopPointResolver({
    listAddressKeysWithoutLocation: async () => overrides.keys ?? [],
    maxPerPlan: overrides.maxPerPlan ?? 10,
    quota: { countInWindow: async () => overrides.used ?? 0, limit: overrides.limit ?? 100 },
    refine:
      overrides.refine ??
      (async ({ addressKey }) => {
        refined.push(addressKey)
      }),
  })
  return { refined, resolver }
}

describe('resolver o ponto das paradas ao planejar', () => {
  test('resolve cada endereço sem ponto pelo degrau 2 (que respeita a correção manual)', async () => {
    const { refined, resolver } = createResolver({ keys: ['a|1|80', 'a|1|971'] })
    await resolver.resolve(INPUT)
    expect(refined).toEqual(['a|1|80', 'a|1|971'])
  })

  test('sem endereço sem ponto, não chama o provedor', async () => {
    const { refined, resolver } = createResolver({ keys: [] })
    await resolver.resolve(INPUT)
    expect(refined).toEqual([])
  })

  test('para no teto de gasto da janela (ADR-0062)', async () => {
    const { refined, resolver } = createResolver({
      keys: ['a', 'b', 'c'],
      limit: 5,
      used: 4,
    })
    await resolver.resolve(INPUT)
    expect(refined).toEqual(['a'])
  })

  test('limita a quantidade por planejamento', async () => {
    const { refined, resolver } = createResolver({ keys: ['a', 'b', 'c'], maxPerPlan: 2 })
    await resolver.resolve(INPUT)
    expect(refined).toEqual(['a', 'b'])
  })

  test('falha do provedor não lança nem impede os demais', async () => {
    const refined: string[] = []
    const { resolver } = createResolver({
      keys: ['a', 'b'],
      refine: async ({ addressKey }) => {
        if (addressKey === 'a') throw new Error('boom')
        refined.push(addressKey)
      },
    })
    await resolver.resolve(INPUT)
    expect(refined).toEqual(['b'])
  })
})

describe('planTripRoute chama o resolvedor antes de congelar', () => {
  test('o resolvedor roda antes do congelamento', async () => {
    const order: string[] = []
    await planTripRoute({
      actorUserId: INPUT.actorUserId,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: INPUT.companyId,
      repository: {
        markRoutePlanned: async () => 'route_planned',
        readRouteState: async () => ({ hasRoute: true, tripStatus: 'draft' }),
      },
      stopPointResolver: {
        resolve: async () => {
          order.push('resolve')
        },
      },
      tollFreezer: {
        freeze: async () => {
          order.push('freeze')
          return { routeFrozen: true }
        },
      },
      tripId: INPUT.tripId,
    })
    expect(order).toEqual(['resolve', 'freeze'])
  })
})
