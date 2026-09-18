/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5 (D8): `mergeTripTimeline` é pura — sem banco — e é onde a ordem e o desempate do
 * cursor vivem. O contrato prova três coisas: a ordem (`occurredAt desc`, prioridade do `kind`, `id`
 * desc), o cursor que não repete nem pula ao paginar 250 itens em páginas de 100, e o parse do
 * cursor opaco (`parseTripTimelineCursor`/`encodeTripTimelineCursor`) rejeitando entrada mal
 * formada.
 */
import { describe, expect, test } from 'bun:test'

import {
  encodeTripTimelineCursor,
  mergeTripTimeline,
  parseTripTimelineCursor,
  type TripTimelineRow,
} from '../../src/trips/infrastructure/trip-timeline.query.js'
import type { TripTimelineKind } from '../../src/trips/application/trip-timeline.types.js'

function row(input: {
  readonly id: string
  readonly kind: TripTimelineKind
  readonly occurredAt: string
}): TripTimelineRow {
  return {
    actorName: null,
    channel: null,
    document: null,
    fromStatus: null,
    id: input.id,
    kind: input.kind,
    occurrence: null,
    occurredAt: new Date(input.occurredAt),
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: null,
    toStatus: null,
  }
}

describe('mergeTripTimeline (spec 158 T5, D8)', () => {
  test('ordena por occurredAt desc; no empate, a prioridade maior do kind vem primeiro', () => {
    const result = mergeTripTimeline({
      limit: 10,
      sources: [
        [row({ id: 'a', kind: 'document.occurrence', occurredAt: '2026-09-18T10:00:00.000Z' })],
        // document.status_changed (prioridade 5) vem antes de stop.occurrence (prioridade 1).
        [row({ id: 'b', kind: 'stop.occurrence', occurredAt: '2026-09-18T12:00:00.000Z' })],
        [row({ id: 'c', kind: 'document.status_changed', occurredAt: '2026-09-18T12:00:00.000Z' })],
      ],
    })

    expect(result.items.map((item) => item.id)).toEqual(['c', 'b', 'a'])
  })

  test('no mesmo occurredAt, a troca de status (efeito) vem acima da chegada que a provocou (causa)', () => {
    const sameInstant = '2026-09-18T13:00:00.000Z'
    const result = mergeTripTimeline({
      limit: 10,
      sources: [
        [row({ id: 'status', kind: 'trip.status_changed', occurredAt: sameInstant })],
        [row({ id: 'arrival', kind: 'stop.arrived', occurredAt: sameInstant })],
      ],
    })

    expect(result.items.map((item) => item.id)).toEqual(['status', 'arrival'])
  })

  test('a conclusão da viagem (efeito) vem acima da entrega (causa) no mesmo instante', () => {
    const sameInstant = '2026-09-18T14:00:00.000Z'
    const result = mergeTripTimeline({
      limit: 10,
      sources: [
        [row({ id: 'completed', kind: 'trip.status_changed', occurredAt: sameInstant })],
        [row({ id: 'delivered', kind: 'document.delivered', occurredAt: sameInstant })],
      ],
    })

    expect(result.items.map((item) => item.id)).toEqual(['completed', 'delivered'])
  })

  test('id desempata quando occurredAt e prioridade do kind coincidem', () => {
    const sameInstant = '2026-09-18T15:00:00.000Z'
    const result = mergeTripTimeline({
      limit: 10,
      sources: [
        [
          row({
            id: '11111111-0000-4000-8000-000000000001',
            kind: 'stop.occurrence',
            occurredAt: sameInstant,
          }),
          row({
            id: '11111111-0000-4000-8000-000000000003',
            kind: 'stop.occurrence',
            occurredAt: sameInstant,
          }),
          row({
            id: '11111111-0000-4000-8000-000000000002',
            kind: 'stop.occurrence',
            occurredAt: sameInstant,
          }),
        ],
      ],
    })

    expect(result.items.map((item) => item.id)).toEqual([
      '11111111-0000-4000-8000-000000000003',
      '11111111-0000-4000-8000-000000000002',
      '11111111-0000-4000-8000-000000000001',
    ])
  })

  test('hasMore é falso quando a soma das fontes não passa do limite', () => {
    const result = mergeTripTimeline({
      limit: 5,
      sources: [
        [row({ id: 'a', kind: 'stop.occurrence', occurredAt: '2026-09-18T10:00:00.000Z' })],
      ],
    })

    expect(result.hasMore).toBe(false)
    expect(result.items).toHaveLength(1)
  })

  test('250 itens paginados de 100 em 100 não repetem nem pulam, mesmo com empates de occurredAt', () => {
    // Cinco instantes com 50 linhas cada — o cenário mais hostil ao cursor: toda página cruza um
    // empate de `occurredAt` no meio do grupo de 50.
    const allRows: TripTimelineRow[] = []
    for (let instantIndex = 0; instantIndex < 5; instantIndex += 1) {
      const occurredAt = new Date(2026, 8, 18, 10 + instantIndex, 0, 0).toISOString()
      for (let itemIndex = 0; itemIndex < 50; itemIndex += 1) {
        allRows.push(
          row({
            id: `00000000-0000-4000-8000-${String(instantIndex * 50 + itemIndex).padStart(12, '0')}`,
            kind: 'stop.occurrence',
            occurredAt,
          }),
        )
      }
    }

    const seen: string[] = []
    let cursor: TripTimelineRow | undefined
    for (let page = 0; page < 3; page += 1) {
      const remaining =
        cursor === undefined
          ? allRows
          : allRows.filter((candidate) => {
              const byTime = candidate.occurredAt.getTime() - cursor!.occurredAt.getTime()
              if (byTime !== 0) return byTime < 0
              return candidate.id < cursor!.id
            })

      const result = mergeTripTimeline({ limit: 100, sources: [remaining] })
      seen.push(...result.items.map((item) => item.id))
      cursor = result.items[result.items.length - 1]
      if (!result.hasMore) break
    }

    expect(seen).toHaveLength(250)
    expect(new Set(seen).size).toBe(250)
    expect(new Set(seen)).toEqual(new Set(allRows.map((item) => item.id)))
  })
})

describe('parseTripTimelineCursor / encodeTripTimelineCursor (spec 158 T5)', () => {
  test('faz o ciclo completo: codifica e decodifica de volta ao mesmo valor', () => {
    const cursor = {
      id: '11111111-0000-4000-8000-000000000009',
      kindPriority: 4,
      occurredAt: new Date('2026-09-18T16:00:00.000Z'),
    }

    const encoded = encodeTripTimelineCursor(cursor)
    const decoded = parseTripTimelineCursor(encoded)

    expect(decoded).toEqual(cursor)
  })

  test('cursor nulo devolve null', () => {
    expect(parseTripTimelineCursor(null)).toBeNull()
  })

  test('cursor que não é base64url válido devolve null, nunca lança', () => {
    expect(parseTripTimelineCursor('não é base64url!!!')).toBeNull()
  })

  test('cursor com JSON válido mas campo faltando devolve null', () => {
    const malformed = Buffer.from(JSON.stringify({ id: 'x' }), 'utf8').toString('base64url')
    expect(parseTripTimelineCursor(malformed)).toBeNull()
  })

  test('cursor com occurredAt inválido devolve null', () => {
    const malformed = Buffer.from(
      JSON.stringify({ id: 'x', kindPriority: 1, occurredAt: 'not-a-date' }),
      'utf8',
    ).toString('base64url')
    expect(parseTripTimelineCursor(malformed)).toBeNull()
  })
})
