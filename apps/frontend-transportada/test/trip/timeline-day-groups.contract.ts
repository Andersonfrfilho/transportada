/**
 * Numa viagem despachada de uma vez, catorze eventos caem no mesmo minuto e cada linha repetia
 * `23/09/2026, 17:31` inteiro: a data ocupava a leitura e o fato desaparecia. O agrupamento por dia
 * tira a data do item e a promove a cabeçalho — a hora sozinha basta dentro do dia.
 */
import { describe, expect, it } from 'bun:test'

import type { TripTimelineItem } from '../../src/modules/trip/shared/trip.types'
import { groupTripTimelineItemsByDay } from '../../src/modules/trip/shared/tripTimeline.service'

const BASE_ITEM: TripTimelineItem = {
  actorName: 'Marina Alves',
  channel: 'office',
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'item-1',
  kind: 'trip.dispatched',
  occurrence: null,
  occurredAt: '2026-09-23T20:31:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: null,
  toStatus: null,
}

function itemAt(id: string, occurredAt: string): TripTimelineItem {
  return { ...BASE_ITEM, id, occurredAt }
}

describe('agrupamento da linha do tempo por dia', () => {
  it('junta num grupo só os eventos do mesmo dia, preservando a ordem da API', () => {
    const groups = groupTripTimelineItemsByDay([
      itemAt('a', '2026-09-23T20:32:00.000Z'),
      itemAt('b', '2026-09-23T18:37:00.000Z'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('abre um grupo novo a cada virada de dia, na ordem em que os itens chegam', () => {
    const groups = groupTripTimelineItemsByDay([
      itemAt('a', '2026-09-23T20:32:00.000Z'),
      itemAt('b', '2026-09-22T12:00:00.000Z'),
      itemAt('c', '2026-09-22T09:00:00.000Z'),
    ])

    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([['a'], ['b', 'c']])
  })

  it('o dia é o local de quem olha, não o UTC do instante', () => {
    const [group] = groupTripTimelineItemsByDay([itemAt('a', '2026-09-23T20:32:00.000Z')])
    const local = new Date('2026-09-23T20:32:00.000Z')
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`

    expect(group?.dayKey).toBe(expected)
  })

  it('data impossível não derruba a lista — vira grupo próprio pelo valor cru', () => {
    const groups = groupTripTimelineItemsByDay([itemAt('a', 'sem-data')])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.dayKey).toBe('sem-data')
  })

  it('lista vazia não inventa grupo', () => {
    expect(groupTripTimelineItemsByDay([])).toEqual([])
  })
})
