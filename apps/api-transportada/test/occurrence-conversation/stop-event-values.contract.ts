/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Espera longa: os eventos da entrega valem até o momento da ocorrência, e a espera é medida até ele.
 */
import { describe, expect, test } from 'bun:test'

import { readOccurrenceStopEventValues } from '../../src/occurrence-conversation/infrastructure/occurrence-stop-events.support.js'
import type { TripQueryable } from '../../src/trips/infrastructure/trip-queryable.type.js'

function fakeDatabase(events: readonly { kind: string; moment: string }[]): TripQueryable {
  let call = 0
  return {
    execute: async () => {
      call += 1
      if (call === 1) {
        return [{ delivery_window_end: null, delivery_window_start: null, stop_id: 'stop-1' }]
      }
      return events.map((event) => ({ kind: event.kind, moment: new Date(event.moment) }))
    },
  } as unknown as TripQueryable
}

const EVENTS = [
  { kind: 'departed', moment: '2026-11-18T13:00:00Z' },
  { kind: 'arrived', moment: '2026-11-18T14:00:00Z' },
  { kind: 'departed', moment: '2026-11-18T20:00:00Z' },
  { kind: 'arrived', moment: '2026-11-18T21:00:00Z' },
] as const

const BASE = { companyId: 'company-1', documentId: 'document-1' }

describe('Espera longa: eventos até o momento da ocorrência', () => {
  test('com o momento da ocorrência, vale a última chegada até ele e a espera vai até ele', async () => {
    const values = await readOccurrenceStopEventValues(fakeDatabase(EVENTS), {
      ...BASE,
      at: new Date('2026-11-18T16:30:00Z'),
      now: () => new Date('2026-11-19T12:00:00Z'),
    })

    expect(values.tempoEspera).toBe('2 h 30 min')
    expect(values.chegada).toContain('11:00')
    expect(values.inicioRota).toContain('10:00')
  })

  test('sem o momento, vale o evento mais recente e a espera vai até agora', async () => {
    const values = await readOccurrenceStopEventValues(fakeDatabase(EVENTS), {
      ...BASE,
      now: () => new Date('2026-11-18T22:30:00Z'),
    })

    expect(values.tempoEspera).toBe('1 h 30 min')
    expect(values.chegada).toContain('18:00')
  })

  test('sem evento até o momento da ocorrência, cai no mais recente', async () => {
    const values = await readOccurrenceStopEventValues(fakeDatabase(EVENTS), {
      ...BASE,
      at: new Date('2026-11-18T12:00:00Z'),
      now: () => new Date('2026-11-18T22:30:00Z'),
    })

    expect(values.chegada).toContain('18:00')
  })
})
