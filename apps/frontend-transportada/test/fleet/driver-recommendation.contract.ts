/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { sortDriversByScore } from '@/modules/fleet/shared/driverRecommendation.service'
import type { FleetDriverListItem } from '@/modules/fleet/shared/fleet.types'

import { DRIVER_DETAIL } from './fleet.fixture'

function buildDriver(overrides: Partial<FleetDriverListItem>): FleetDriverListItem {
  return { ...DRIVER_DETAIL, score: null, ...overrides }
}

describe('a ordenação da nota no seletor de motoristas (RF11, aceite 7)', () => {
  it('ordena da maior nota para a menor', () => {
    const drivers = [
      buildDriver({ id: 'a', name: 'Ana', score: 60 }),
      buildDriver({ id: 'b', name: 'Bruno', score: 90 }),
      buildDriver({ id: 'c', name: 'Carlos', score: 75 }),
    ]

    expect(sortDriversByScore(drivers).map((driver) => driver.id)).toEqual(['b', 'c', 'a'])
  })

  it('sem histórico (null) sempre por último, independente da posição de entrada', () => {
    const drivers = [
      buildDriver({ id: 'a', name: 'Ana', score: null }),
      buildDriver({ id: 'b', name: 'Bruno', score: 40 }),
    ]

    expect(sortDriversByScore(drivers).map((driver) => driver.id)).toEqual(['b', 'a'])
  })

  it('empate na nota desempata pelo nome', () => {
    const drivers = [
      buildDriver({ id: 'a', name: 'Zeca', score: 80 }),
      buildDriver({ id: 'b', name: 'Ana', score: 80 }),
    ]

    expect(sortDriversByScore(drivers).map((driver) => driver.id)).toEqual(['b', 'a'])
  })

  it('vários sem histórico desempatam entre si pelo nome', () => {
    const drivers = [
      buildDriver({ id: 'a', name: 'Zeca', score: null }),
      buildDriver({ id: 'b', name: 'Ana', score: null }),
    ]

    expect(sortDriversByScore(drivers).map((driver) => driver.id)).toEqual(['b', 'a'])
  })

  it('não muta a lista de entrada — devolve uma nova', () => {
    const drivers = [buildDriver({ id: 'a', name: 'Ana', score: 10 })]
    const sorted = sortDriversByScore(drivers)

    expect(sorted).not.toBe(drivers)
  })
})
