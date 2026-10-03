/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  DIRECT_TAP_POSITION_BUDGET_MS,
  DIRECT_TAP_POSITION_MAX_AGE_MS,
  readDirectTapLocation,
} from '../../src/modules/driver-trip/shared/driverLocation.service'

type PositionCallback = (position: GeolocationPosition) => void

/** Relógio falso: guarda o que foi agendado e só dispara quando o teste manda. */
function createFakeTimer() {
  const scheduled: { callback: () => void; isCancelled: boolean; milliseconds: number }[] = []
  return {
    fire: () => scheduled.forEach((entry) => !entry.isCancelled && entry.callback()),
    scheduled,
    timer: (callback: () => void, milliseconds: number) => {
      const entry = { callback, isCancelled: false, milliseconds }
      scheduled.push(entry)
      return () => {
        entry.isCancelled = true
      }
    },
  }
}

function buildPosition(accuracy: number): GeolocationPosition {
  return {
    coords: { accuracy, latitude: -23.55, longitude: -46.63 },
    timestamp: Date.parse('2026-10-03T12:00:00.000Z'),
  } as GeolocationPosition
}

/**
 * Spec 196 D5: o toque direto não tem gravação local para fazer antes — espera a posição, mas com um
 * relógio da própria app. O `timeout` da Geolocation API só conta depois da permissão: o primeiro
 * pedido de permissão seguraria o botão para sempre.
 */
describe('readDirectTapLocation (196 T5.3)', () => {
  it('uma Geolocation que ignora as opções e nunca responde resolve `null` em 3 s', async () => {
    const clock = createFakeTimer()
    const geolocation = { getCurrentPosition: () => undefined } as unknown as Geolocation

    const pending = readDirectTapLocation({ geolocation, timer: clock.timer })

    expect(clock.scheduled.map((entry) => entry.milliseconds)).toEqual([3_000])
    expect(DIRECT_TAP_POSITION_BUDGET_MS).toBe(3_000)
    clock.fire()
    expect(await pending).toBeNull()
  })

  it('uma que responde devolve a posição, com a precisão, e cancela o relógio', async () => {
    const clock = createFakeTimer()
    let seenOptions: PositionOptions | undefined
    const geolocation = {
      getCurrentPosition: (
        onSuccess: PositionCallback,
        _onError: unknown,
        options: PositionOptions,
      ) => {
        seenOptions = options
        onSuccess(buildPosition(40))
      },
    } as unknown as Geolocation

    const location = await readDirectTapLocation({ geolocation, timer: clock.timer })

    expect(location).toEqual({
      accuracyMeters: 40,
      capturedAt: '2026-10-03T12:00:00.000Z',
      latitude: -23.55,
      longitude: -46.63,
    })
    expect(seenOptions).toEqual({
      enableHighAccuracy: false,
      maximumAge: DIRECT_TAP_POSITION_MAX_AGE_MS,
    })
    expect(DIRECT_TAP_POSITION_MAX_AGE_MS).toBe(300_000)
    expect(clock.scheduled[0]?.isCancelled).toBe(true)
  })

  it('precisão acima do teto da API sai sem `accuracyMeters`, em vez de virar 400', async () => {
    const geolocation = {
      getCurrentPosition: (onSuccess: PositionCallback) => onSuccess(buildPosition(50_000)),
    } as unknown as Geolocation

    const location = await readDirectTapLocation({ geolocation, timer: createFakeTimer().timer })

    expect(location).not.toBeNull()
    expect(location).not.toHaveProperty('accuracyMeters')
  })

  it('permissão negada resolve `null` na hora, sem esperar o relógio', async () => {
    const clock = createFakeTimer()
    const geolocation = {
      getCurrentPosition: (_onSuccess: unknown, onError: () => void) => onError(),
    } as unknown as Geolocation

    expect(await readDirectTapLocation({ geolocation, timer: clock.timer })).toBeNull()
    expect(clock.scheduled[0]?.isCancelled).toBe(true)
  })

  it('sem Geolocation no navegador resolve `null` sem agendar nada', async () => {
    const clock = createFakeTimer()

    expect(await readDirectTapLocation({ geolocation: undefined, timer: clock.timer })).toBeNull()
    expect(clock.scheduled).toHaveLength(0)
  })
})
