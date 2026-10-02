/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 225 D9: a espera na parada. `departed` mora na parada de **destino** (ADR-0088 §1), então a
 * saída de uma parada é o primeiro `departed` de outra depois da chegada — e estes testes prendem
 * isso, porque `departed − arrived` da mesma parada daria negativo e nada acusaria.
 */
import { describe, expect, test } from 'bun:test'

import { DWELL_BASES } from '../../src/trips/domain/document-cost-apportionment.types.js'
import {
  resolveStopDwells,
  STOP_DWELL_EVENT_KINDS,
  type StopDwellEvent,
} from '../../src/trips/domain/stop-dwell.policy.js'

const FIRST_STOP = 'stop-1'
const SECOND_STOP = 'stop-2'
const STOP_IDS = [FIRST_STOP, SECOND_STOP]

function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 9, 2, 8, minutes))
}

function event(kind: StopDwellEvent['kind'], stopId: string, minutes: number): StopDwellEvent {
  return { kind, occurredAt: at(minutes), stopId }
}

describe('a espera da parada é da chegada até a saída para a próxima (spec 225 D9)', () => {
  test('a saída é o departed da PRÓXIMA parada, não o da própria', () => {
    const [first] = resolveStopDwells({
      events: [
        event(STOP_DWELL_EVENT_KINDS.departed, FIRST_STOP, 0),
        event(STOP_DWELL_EVENT_KINDS.arrived, FIRST_STOP, 30),
        event(STOP_DWELL_EVENT_KINDS.departed, SECOND_STOP, 50),
        event(STOP_DWELL_EVENT_KINDS.arrived, SECOND_STOP, 90),
      ],
      stopIds: STOP_IDS,
    })

    expect(first).toEqual({
      dwellBasis: DWELL_BASES.measured,
      dwellSeconds: 20 * 60,
      id: FIRST_STOP,
    })
  })

  test('saída desfeita não conta: vale a seguinte, e o cancelamento empata no mesmo carimbo', () => {
    const [first] = resolveStopDwells({
      events: [
        event(STOP_DWELL_EVENT_KINDS.arrived, FIRST_STOP, 30),
        event(STOP_DWELL_EVENT_KINDS.departed, SECOND_STOP, 40),
        event(STOP_DWELL_EVENT_KINDS.departureCancelled, SECOND_STOP, 40),
        event(STOP_DWELL_EVENT_KINDS.departed, SECOND_STOP, 55),
      ],
      stopIds: STOP_IDS,
    })

    expect(first?.dwellSeconds).toBe(25 * 60)
    expect(first?.dwellBasis).toBe(DWELL_BASES.measured)
  })

  test('sem saída registrada, o último delivered serve de saída e o tempo sai parcial', () => {
    const [first] = resolveStopDwells({
      events: [
        event(STOP_DWELL_EVENT_KINDS.arrived, FIRST_STOP, 30),
        event(STOP_DWELL_EVENT_KINDS.delivered, FIRST_STOP, 35),
        event(STOP_DWELL_EVENT_KINDS.delivered, FIRST_STOP, 42),
      ],
      stopIds: STOP_IDS,
    })

    expect(first).toEqual({ dwellBasis: DWELL_BASES.proxy, dwellSeconds: 12 * 60, id: FIRST_STOP })
  })

  test('sem chegada a espera é zero e desconhecida, nunca um palpite', () => {
    const [first] = resolveStopDwells({
      events: [event(STOP_DWELL_EVENT_KINDS.delivered, FIRST_STOP, 35)],
      stopIds: STOP_IDS,
    })

    expect(first).toEqual({ dwellBasis: DWELL_BASES.unknown, dwellSeconds: 0, id: FIRST_STOP })
  })

  test('chegou e nada indica a saída: desconhecida, não zero medido', () => {
    const [first] = resolveStopDwells({
      events: [event(STOP_DWELL_EVENT_KINDS.arrived, FIRST_STOP, 30)],
      stopIds: STOP_IDS,
    })

    expect(first?.dwellBasis).toBe(DWELL_BASES.unknown)
  })

  test('devolve uma entrada por parada, na ordem da rota', () => {
    const dwells = resolveStopDwells({ events: [], stopIds: [SECOND_STOP, FIRST_STOP] })

    expect(dwells.map((dwell) => dwell.id)).toEqual([SECOND_STOP, FIRST_STOP])
  })
})
