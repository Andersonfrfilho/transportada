/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  CURRENT_LOCATION_APP_BUDGET_MS,
  DIRECT_TAP_POSITION_BUDGET_MS,
  DIRECT_TAP_POSITION_MAX_AGE_MS,
  readCurrentLocation,
  readDirectTapLocation,
  usesDirectTapLocation,
} from '../../src/modules/driver-trip/shared/driverLocation.service'
import type { DriverFieldReport } from '../../src/modules/driver-trip/shared/driverTrip.types'

const HOOK = new URL('../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts', import.meta.url)

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

  it('precisão acima de 10 km segue crua: o servidor limita ao teto, e o ponto não perde a precisão', async () => {
    const geolocation = {
      getCurrentPosition: (onSuccess: PositionCallback) => onSuccess(buildPosition(50_000)),
    } as unknown as Geolocation

    const location = await readDirectTapLocation({ geolocation, timer: createFakeTimer().timer })

    expect(location?.accuracyMeters).toBe(50_000)
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

/**
 * A leitura de 8 s do hook também tem relógio da app: com o pedido de permissão aberto o `timeout` da
 * Geolocation API não corre, e a drenagem da fila esperaria sem prazo.
 */
describe('readCurrentLocation (196 revisão)', () => {
  it('uma Geolocation que nunca responde resolve `null` no prazo da app (~8 s)', async () => {
    const clock = createFakeTimer()
    const geolocation = { getCurrentPosition: () => undefined } as unknown as Geolocation

    const pending = readCurrentLocation({ geolocation, timer: clock.timer })

    expect(clock.scheduled.map((entry) => entry.milliseconds)).toEqual([8_500])
    expect(CURRENT_LOCATION_APP_BUDGET_MS).toBe(8_500)
    clock.fire()
    expect(await pending).toBeNull()
  })

  it('uma que responde devolve a precisão crua, mesmo acima de 10 km, e cancela o relógio', async () => {
    const clock = createFakeTimer()
    const geolocation = {
      getCurrentPosition: (onSuccess: PositionCallback) => onSuccess(buildPosition(50_000)),
    } as unknown as Geolocation

    const location = await readCurrentLocation({ geolocation, timer: clock.timer })

    expect(location?.accuracyMeters).toBe(50_000)
    expect(clock.scheduled[0]?.isCancelled).toBe(true)
  })

  it('permissão negada resolve `null` na hora; sem Geolocation, sem agendar nada', async () => {
    const clock = createFakeTimer()
    const denied = {
      getCurrentPosition: (_onSuccess: unknown, onError: () => void) => onError(),
    } as unknown as Geolocation

    expect(await readCurrentLocation({ geolocation: denied, timer: clock.timer })).toBeNull()
    expect(clock.scheduled[0]?.isCancelled).toBe(true)
    const none = createFakeTimer()
    expect(await readCurrentLocation({ geolocation: undefined, timer: none.timer })).toBeNull()
    expect(none.scheduled).toHaveLength(0)
  })
})

/**
 * Spec 196 RF8: despachar e "Iniciar rota" disparam o `POST` em até 3 s. Os dois viraram itens da
 * fila (specs 230 e 206), que espera a leitura antes da drenagem — a leitura deles é a do relógio.
 */
describe('quem usa a leitura com relógio (196 RF8)', () => {
  const key = { idempotencyKey: 'chave-1' }

  it('o despacho e o "Iniciar rota" usam; os demais toques mantêm a leitura de 8 s', () => {
    const dispatch: DriverFieldReport = { ...key, kind: 'dispatch', location: null, tripId: 't' }
    const depart: DriverFieldReport = {
      ...key,
      kind: 'depart',
      location: null,
      stopId: 's',
      tappedAt: '2026-10-03T12:00:00.000Z',
    }
    const arrive: DriverFieldReport = { ...key, kind: 'arrive', location: null, stopId: 's' }

    expect(usesDirectTapLocation([dispatch])).toBe(true)
    expect(usesDirectTapLocation([depart])).toBe(true)
    expect(usesDirectTapLocation([arrive])).toBe(false)
    expect(usesDirectTapLocation([dispatch, arrive])).toBe(false)
    expect(usesDirectTapLocation([])).toBe(false)
  })

  it('o hook escolhe a leitura por quem toca', () => {
    const hook = readFileSync(HOOK, 'utf8')

    expect(hook).toInclude('usesDirectTapLocation(reports)')
    expect(hook).toInclude('readDirectTapLocation()')
  })
})
