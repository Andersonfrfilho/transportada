/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 228 T1.1 (D6, D8): o vocabulário da linha do tempo ganha `document.canhoto_photo` e
 * `stop.address_corrected` **no fim** da lista, com prioridades novas, e nenhuma prioridade existente
 * é renumerada — o cursor em voo compara `::int` e quebraria (206 D12). Esta tabela é a fotografia
 * inteira: mexer em qualquer número reprova aqui.
 */
import { describe, expect, test } from 'bun:test'

import {
  TRIP_TIMELINE_ADDRESS_CHANGE_ORIGINS,
  TRIP_TIMELINE_KIND_PRIORITY,
  TRIP_TIMELINE_KINDS,
} from '../../src/trips/application/trip-timeline.types.js'
import type { TripTimelineItem } from '../../src/trips/application/trip-timeline.types.js'

describe('vocabulário da linha do tempo (spec 228 T1.1)', () => {
  test('os dois kinds novos entram depois de trip.created, na ordem da D6', () => {
    expect(TRIP_TIMELINE_KINDS.slice(-3)).toEqual([
      'trip.created',
      'document.canhoto_photo',
      'stop.address_corrected',
    ])
  })

  test('a tabela de prioridades inteira: nada existente renumerado, 4 e 2 para os novos', () => {
    expect(TRIP_TIMELINE_KIND_PRIORITY).toEqual({
      'document.canhoto_photo': 4,
      'document.delivered': 4,
      'document.occurrence': 2,
      'document.returned': 3,
      'document.status_changed': 5,
      'stop.address_corrected': 2,
      'stop.arrived': 0,
      'stop.departed': 0,
      'stop.departure_cancelled': 0,
      'stop.occurrence': 1,
      'trip.created': -1,
      'trip.dispatched': 6,
      'trip.status_changed': 7,
    })
  })

  test('toda prioridade é inteira (a consulta compara ::int)', () => {
    for (const priority of Object.values(TRIP_TIMELINE_KIND_PRIORITY)) {
      expect(Number.isInteger(priority)).toBe(true)
    }
  })

  test('as origens do addressChange são as quatro da D8', () => {
    expect([...TRIP_TIMELINE_ADDRESS_CHANGE_ORIGINS]).toEqual([
      'contractor',
      'driver',
      'operator',
      'refinement',
    ])
  })

  test('addressChange é opcional no item e carrega só origem e deslocamento', () => {
    const base: TripTimelineItem = {
      actorName: null,
      channel: null,
      closeReason: null,
      document: null,
      fromStatus: null,
      id: 'item-1',
      kind: 'stop.address_corrected',
      lateRegistration: false,
      location: null,
      locationState: null,
      occurrence: null,
      occurredAt: '2026-10-02T12:00:00.000Z',
      onBehalfOfDriverName: null,
      recordedAt: null,
      returnReason: null,
      stop: null,
      toStatus: null,
    }
    const corrected: TripTimelineItem = {
      ...base,
      addressChange: { displacementMeters: null, origin: 'refinement' },
    }
    expect(Object.keys(corrected.addressChange ?? {}).sort()).toEqual([
      'displacementMeters',
      'origin',
    ])
    expect('addressChange' in base).toBe(false)
  })
})
