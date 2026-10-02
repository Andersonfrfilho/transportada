/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 225 D9: a espera na parada. `departed` mora na parada de **destino** (ADR-0088 §1), então a
 * saída de uma parada é o primeiro `departed` de outra depois da chegada — e estes testes prendem
 * isso, porque `departed − arrived` da mesma parada daria negativo e nada acusaria.
 */
import { describe, expect, test } from 'bun:test'

import { TRIP_FIELD_CHANNELS } from '../../src/database/trip.schema.js'
import { DWELL_BASES } from '../../src/trips/domain/document-cost-apportionment.types.js'
import {
  EVENT_CLOCKS,
  resolveStopDwells,
  STOP_DWELL_EVENT_KINDS,
  type StopDwellEvent,
} from '../../src/trips/domain/stop-dwell.policy.js'

const FIRST_STOP = 'stop-1'
const SECOND_STOP = 'stop-2'
const THIRD_STOP = 'stop-3'
const STOP_IDS = [FIRST_STOP, SECOND_STOP]

function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 9, 2, 8, minutes))
}

/** Por padrão o evento é do aplicativo, no relógio do aparelho — a única origem que mede espera. */
function event(
  kind: StopDwellEvent['kind'],
  stopId: string,
  minutes: number,
  origin: Partial<Pick<StopDwellEvent, 'channel' | 'clock'>> = {},
): StopDwellEvent {
  return {
    channel: TRIP_FIELD_CHANNELS.driverApp,
    clock: EVENT_CLOCKS.device,
    kind,
    occurredAt: at(minutes),
    stopId,
    ...origin,
  }
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

  /**
   * Revisão da 225, M1. Sem `departed` para a parada seguinte (chegada pelo escritório, pelo WhatsApp,
   * por app antigo ou por "Registrar entrega depois" — a API aceita chegada sem saída, ADR-0088 §5), o
   * primeiro `departed` de outra parada fica lá na frente e a espera engolia o trajeto **e** a espera
   * da parada seguinte: o mesmo minuto contado duas vezes, o erro que o próprio D9 condena.
   */
  test('sem departed para a parada seguinte, a espera para na chegada dela e sai proxy', () => {
    const [first, second] = resolveStopDwells({
      events: [
        event(STOP_DWELL_EVENT_KINDS.departed, FIRST_STOP, 0),
        event(STOP_DWELL_EVENT_KINDS.arrived, FIRST_STOP, 10),
        event(STOP_DWELL_EVENT_KINDS.arrived, SECOND_STOP, 40),
        event(STOP_DWELL_EVENT_KINDS.delivered, SECOND_STOP, 45),
        event(STOP_DWELL_EVENT_KINDS.departed, THIRD_STOP, 120),
      ],
      stopIds: [FIRST_STOP, SECOND_STOP, THIRD_STOP],
    })

    expect(first).toEqual({ dwellBasis: DWELL_BASES.proxy, dwellSeconds: 30 * 60, id: FIRST_STOP })
    expect(second).toEqual({
      dwellBasis: DWELL_BASES.measured,
      dwellSeconds: 80 * 60,
      id: SECOND_STOP,
    })
  })

  test('uma entrega em outra parada também encerra a espera daqui', () => {
    const [first] = resolveStopDwells({
      events: [
        event(STOP_DWELL_EVENT_KINDS.arrived, FIRST_STOP, 10),
        event(STOP_DWELL_EVENT_KINDS.delivered, SECOND_STOP, 25),
        event(STOP_DWELL_EVENT_KINDS.departed, THIRD_STOP, 90),
      ],
      stopIds: [FIRST_STOP, SECOND_STOP, THIRD_STOP],
    })

    expect(first).toEqual({ dwellBasis: DWELL_BASES.proxy, dwellSeconds: 15 * 60, id: FIRST_STOP })
  })

  /**
   * Revisão da 225, M3. O ADR-0088 §6 só mede com os dois extremos no mesmo relógio e do `driver_app`.
   * Subtrair o `departed` do aparelho do `arrived` que o escritório digitou, ou que o servidor carimbou,
   * inflaria ou zeraria a espera — e a espera negativa ainda sairia como medida.
   */
  test('chegada do escritório e saída do aplicativo não se subtraem como medida', () => {
    const [first] = resolveStopDwells({
      events: [
        event(STOP_DWELL_EVENT_KINDS.arrived, FIRST_STOP, 30, { channel: 'office' }),
        event(STOP_DWELL_EVENT_KINDS.departed, SECOND_STOP, 50),
      ],
      stopIds: STOP_IDS,
    })

    expect(first?.dwellBasis).toBe(DWELL_BASES.proxy)
    expect(first?.dwellSeconds).toBe(20 * 60)
  })

  test('relógio do servidor contra relógio do aparelho também rebaixa para proxy', () => {
    const [first] = resolveStopDwells({
      events: [
        event(STOP_DWELL_EVENT_KINDS.arrived, FIRST_STOP, 30, { clock: EVENT_CLOCKS.server }),
        event(STOP_DWELL_EVENT_KINDS.departed, SECOND_STOP, 50),
      ],
      stopIds: STOP_IDS,
    })

    expect(first?.dwellBasis).toBe(DWELL_BASES.proxy)
  })

  test('os dois extremos do aplicativo, no mesmo relógio do servidor, ainda medem', () => {
    const [first] = resolveStopDwells({
      events: [
        event(STOP_DWELL_EVENT_KINDS.arrived, FIRST_STOP, 30, { clock: EVENT_CLOCKS.server }),
        event(STOP_DWELL_EVENT_KINDS.departed, SECOND_STOP, 50, { clock: EVENT_CLOCKS.server }),
      ],
      stopIds: STOP_IDS,
    })

    expect(first?.dwellBasis).toBe(DWELL_BASES.measured)
  })

  test('devolve uma entrada por parada, na ordem da rota', () => {
    const dwells = resolveStopDwells({ events: [], stopIds: [SECOND_STOP, FIRST_STOP] })

    expect(dwells.map((dwell) => dwell.id)).toEqual([SECOND_STOP, FIRST_STOP])
  })
})
