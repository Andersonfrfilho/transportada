/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { DriverTrip } from '@/modules/driver-trip/shared/driverTrip.types'
import { createLocationConsentRevocation } from '@/modules/driver-trip/shared/locationConsentRevocation.service'
import {
  createLocationSharingController,
  LOCATION_SHARING_INTERVAL_MS,
  POSITION_UNAVAILABLE_RETRY_DELAY_MS,
  shouldShareLocation,
  type LocationSharingStatus,
} from '@/modules/driver-trip/shared/locationSharing.service'

function buildTrip(status: string): DriverTrip {
  return { id: status, manifest: null, status, stops: [], vehiclePlate: 'GCQ8E47' }
}

type FakeWatch = Readonly<{
  onError: PositionErrorCallback | null | undefined
  success: PositionCallback
}>

type HarnessOptions = Readonly<{
  /** O `send` de verdade espera o token antes do `fetch`: aqui, o teste solta quando quiser. */
  holdSends?: boolean
}>

/** Um GPS e um relógio de mentira: o teste decide quando chega posição e quanto tempo passou. */
function buildHarness(options: HarnessOptions = {}) {
  let clock = 0
  let nextId = 1
  const watches = new Map<number, FakeWatch>()
  /** Todo `watch` já aberto, inclusive os limpos: o navegador pode ter um callback já na fila. */
  const everyWatch: FakeWatch[] = []
  const cleared: number[] = []
  const timers = new Map<number, { at: number; callback: () => void }>()
  const sent: Array<Readonly<{ latitude: string; longitude: string }>> = []
  const heldSends: Array<() => void> = []
  const statuses: LocationSharingStatus[] = []
  const revocation = createLocationConsentRevocation()

  const controller = createLocationSharingController({
    clearTimer: (timerId) => {
      timers.delete(timerId)
    },
    geolocation: {
      clearWatch: (watchId) => {
        cleared.push(watchId)
        watches.delete(watchId)
      },
      watchPosition: (success, onError) => {
        const watchId = nextId++
        watches.set(watchId, { onError, success })
        everyWatch.push({ onError, success })
        return watchId
      },
    },
    now: () => clock,
    onStatusChange: (status) => statuses.push(status),
    revocation,
    send: (position, signal) => {
      // O `fetch` com sinal já abortado não sai do aparelho — é o que este `if` imita.
      const leave = () => {
        if (!signal.aborted) sent.push(position)
      }
      if (options.holdSends !== true) {
        leave()
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        heldSends.push(() => {
          leave()
          resolve()
        })
      })
    },
    setTimer: (callback, delayMs) => {
      const timerId = nextId++
      timers.set(timerId, { at: clock + delayMs, callback })
      return timerId
    },
  })

  function advance(milliseconds: number): void {
    const target = clock + milliseconds
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort(([, left], [, right]) => left.at - right.at)[0]
      if (due === undefined) break
      const [timerId, timer] = due
      timers.delete(timerId)
      clock = timer.at
      timer.callback()
    }
    clock = target
  }

  function emitPosition(latitude: number, longitude: number): void {
    for (const watch of watches.values()) {
      watch.success({
        coords: { accuracy: 10, latitude, longitude },
        timestamp: clock,
      } as GeolocationPosition)
    }
  }

  function emitError(code: number): void {
    for (const watch of [...watches.values()]) {
      watch.onError?.({ code, message: 'fake' } as GeolocationPositionError)
    }
  }

  /** Um callback que o navegador já tinha enfileirado antes do `clearWatch`. */
  function emitOnEveryWatch(latitude: number, longitude: number): void {
    for (const watch of everyWatch) {
      watch.success({
        coords: { accuracy: 10, latitude, longitude },
        timestamp: clock,
      } as GeolocationPosition)
    }
  }

  function releaseSends(): void {
    for (const release of heldSends.splice(0)) release()
  }

  return {
    activeWatches: () => watches.size,
    advance,
    cleared,
    controller,
    emitError,
    emitOnEveryWatch,
    emitPosition,
    pendingTimers: () => timers.size,
    releaseSends,
    revocation,
    sent,
    statuses,
  }
}

/**
 * ADR-0075 §8, RF15 (e ADR-0050 §5): posição contínua só com o consentimento do motorista, a
 * viagem na rua e a app na tela — e no máximo um envio a cada 60 s. Fora disso, o GPS nem é
 * observado: `clearWatch` é o que garante que nada é colhido sem motivo.
 */
describe('quando a posição pode subir (spec 189 T7.5)', () => {
  it('com consentimento, viagem na rua e app visível', () => {
    for (const status of ['dispatched', 'in_transit', 'on_delivery_route']) {
      expect(
        shouldShareLocation({ hasConsent: true, isVisible: true, trips: [buildTrip(status)] }),
      ).toBe(true)
    }
  })

  it('sem consentimento, nunca', () => {
    expect(
      shouldShareLocation({ hasConsent: false, isVisible: true, trips: [buildTrip('in_transit')] }),
    ).toBe(false)
  })

  it('viagem fora da rua (planejada, sem viagem), nunca', () => {
    expect(
      shouldShareLocation({
        hasConsent: true,
        isVisible: true,
        trips: [buildTrip('route_planned')],
      }),
    ).toBe(false)
    expect(shouldShareLocation({ hasConsent: true, isVisible: true, trips: [] })).toBe(false)
  })

  it('app escondida, nunca', () => {
    expect(
      shouldShareLocation({ hasConsent: true, isVisible: false, trips: [buildTrip('in_transit')] }),
    ).toBe(false)
  })

  /** A carga está na rua se qualquer viagem dele está: a escolhida na tela pode ser a planejada. */
  it('basta uma das viagens estar na rua', () => {
    expect(
      shouldShareLocation({
        hasConsent: true,
        isVisible: true,
        trips: [buildTrip('route_planned'), buildTrip('in_transit')],
      }),
    ).toBe(true)
  })
})

describe('o envio da posição (spec 189 T7.5)', () => {
  it('inativo, não observa o GPS nem envia', () => {
    const harness = buildHarness()

    harness.controller.update(false)
    harness.emitPosition(-23.55, -46.63)

    expect(harness.activeWatches()).toBe(0)
    expect(harness.sent).toEqual([])
  })

  it('a primeira posição sobe na hora, com sete casas em texto', () => {
    const harness = buildHarness()

    harness.controller.update(true)
    harness.emitPosition(-23.5505199123, -46.6333094)

    expect(harness.sent).toEqual([{ latitude: '-23.5505199', longitude: '-46.6333094' }])
    expect(harness.statuses.at(-1)).toBe('sharing')
  })

  it('no máximo um envio a cada 60 s, mesmo com o GPS mandando posição a todo instante', () => {
    const harness = buildHarness()
    harness.controller.update(true)

    harness.emitPosition(-23.55, -46.63)
    for (let second = 1; second < 60; second += 1) {
      harness.advance(1_000)
      harness.emitPosition(-23.55 - second / 10_000, -46.63)
    }
    expect(harness.sent).toHaveLength(1)

    harness.advance(1_000)
    expect(harness.sent).toHaveLength(2)
    expect(harness.sent[1]?.latitude).toBe('-23.5559000')

    harness.advance(LOCATION_SHARING_INTERVAL_MS * 3)
    expect(harness.sent).toHaveLength(5)
  })

  it('desligar limpa o watch e o temporizador: nada mais sobe', () => {
    const harness = buildHarness()
    harness.controller.update(true)
    harness.emitPosition(-23.55, -46.63)

    harness.controller.update(false)
    harness.advance(LOCATION_SHARING_INTERVAL_MS * 5)
    harness.emitPosition(-23.56, -46.64)

    expect(harness.cleared).toHaveLength(1)
    expect(harness.activeWatches()).toBe(0)
    expect(harness.sent).toHaveLength(1)
    expect(harness.statuses.at(-1)).toBe('off')
  })

  /** Esconder e voltar logo não fura o teto: o relógio do último envio sobrevive à pausa. */
  it('religar antes de 60 s espera o resto do intervalo', () => {
    const harness = buildHarness()
    harness.controller.update(true)
    harness.emitPosition(-23.55, -46.63)

    harness.controller.update(false)
    harness.advance(10_000)
    harness.controller.update(true)
    harness.emitPosition(-23.56, -46.64)
    expect(harness.sent).toHaveLength(1)

    harness.advance(49_999)
    expect(harness.sent).toHaveLength(1)
    harness.advance(1)
    expect(harness.sent).toHaveLength(2)
  })

  it('GPS negado: posição indisponível no aparelho, sem watch e sem envio', () => {
    const harness = buildHarness()
    harness.controller.update(true)

    harness.emitError(1)
    harness.advance(LOCATION_SHARING_INTERVAL_MS * 2)

    expect(harness.statuses.at(-1)).toBe('unavailable')
    expect(harness.activeWatches()).toBe(0)
    expect(harness.sent).toEqual([])
  })

  it('demora do GPS não é recusa: continua esperando a posição', () => {
    const harness = buildHarness()
    harness.controller.update(true)

    harness.emitError(3)
    harness.emitPosition(-23.55, -46.63)

    expect(harness.statuses.at(-1)).toBe('sharing')
    expect(harness.sent).toHaveLength(1)
  })

  /**
   * Code M6 (spec 189 T9.2): sem sinal (debaixo de viaduto, garagem) é transitório, ao contrário da
   * negação — o `watch` continua aberto e, se o aparelho parar de chamar sozinho, reabre depois de
   * `POSITION_UNAVAILABLE_RETRY_DELAY_MS`.
   */
  it('GPS sem sinal: mantém o watch e tenta de novo depois de um tempo', () => {
    const harness = buildHarness()
    harness.controller.update(true)

    harness.emitError(2)

    expect(harness.statuses.at(-1)).not.toBe('unavailable')
    expect(harness.activeWatches()).toBe(1)
    expect(harness.cleared).toHaveLength(0)

    harness.advance(POSITION_UNAVAILABLE_RETRY_DELAY_MS)

    expect(harness.cleared).toHaveLength(1)
    expect(harness.activeWatches()).toBe(1)

    harness.emitPosition(-23.55, -46.63)
    expect(harness.sent).toHaveLength(1)
    expect(harness.statuses.at(-1)).toBe('sharing')
  })

  it('desligar durante a espera do sinal cancela o novo tento', () => {
    const harness = buildHarness()
    harness.controller.update(true)

    harness.emitError(2)
    harness.controller.update(false)
    harness.advance(POSITION_UNAVAILABLE_RETRY_DELAY_MS * 2)

    expect(harness.activeWatches()).toBe(0)
    expect(harness.sent).toEqual([])
  })
})

/**
 * T9.2, CA14 na CI (LGPD art. 8º §5º): o toque em "desligar" é a fonte da verdade para o
 * controlador. Antes, ele só parava quando a tela da viagem re-renderizava com `hasConsent` falso —
 * e isso depende do `setTimeout(0)` com que o TanStack avisa os observadores e de um efeito do
 * React. O temporizador de envio que vencesse nesse intervalo mandava mais uma posição.
 */
describe('desligar corta o envio no toque (spec 189 T9.2)', () => {
  it('a retirada local limpa watch e temporizador na hora, sem esperar o update(false)', () => {
    const harness = buildHarness()
    harness.controller.update(true)
    harness.emitPosition(-23.55, -46.63)
    expect(harness.sent).toHaveLength(1)

    harness.revocation.revoke()

    expect(harness.activeWatches()).toBe(0)
    expect(harness.pendingTimers()).toBe(0)
    expect(harness.statuses.at(-1)).toBe('off')
    harness.advance(LOCATION_SHARING_INTERVAL_MS * 5)
    harness.emitPosition(-23.56, -46.64)
    expect(harness.sent).toHaveLength(1)
  })

  it('desligar durante o novo tento agendado (sem sinal) não reabre o watch', () => {
    const harness = buildHarness()
    harness.controller.update(true)
    harness.emitError(2)

    harness.revocation.revoke()
    harness.advance(POSITION_UNAVAILABLE_RETRY_DELAY_MS * 2)

    expect(harness.activeWatches()).toBe(0)
    expect(harness.pendingTimers()).toBe(0)
    expect(harness.sent).toEqual([])
  })

  it('o envio que ainda esperava o token não sai depois do toque', () => {
    const harness = buildHarness({ holdSends: true })
    harness.controller.update(true)
    harness.emitPosition(-23.55, -46.63)

    harness.revocation.revoke()
    harness.releaseSends()

    expect(harness.sent).toEqual([])
  })

  it('callback de posição já enfileirado antes do clearWatch não envia', () => {
    const harness = buildHarness()
    harness.controller.update(true)
    harness.emitError(3)

    harness.revocation.revoke()
    harness.emitOnEveryWatch(-23.55, -46.63)
    harness.advance(LOCATION_SHARING_INTERVAL_MS * 2)

    expect(harness.sent).toEqual([])
    expect(harness.statuses.at(-1)).toBe('off')
  })

  /** A tela da viagem ainda pode renderizar com o `hasConsent` velho: o update(true) não religa. */
  it('com a retirada valendo, update(true) atrasado não religa', () => {
    const harness = buildHarness()
    harness.revocation.revoke()

    harness.controller.update(true)
    harness.emitPosition(-23.55, -46.63)

    expect(harness.activeWatches()).toBe(0)
    expect(harness.sent).toEqual([])
  })

  it('ligar de novo (retirada desfeita) volta a compartilhar', () => {
    const harness = buildHarness()
    harness.controller.update(true)
    harness.revocation.revoke()

    harness.revocation.restore()
    harness.controller.update(true)
    harness.emitPosition(-23.55, -46.63)

    expect(harness.sent).toHaveLength(1)
    expect(harness.statuses.at(-1)).toBe('sharing')
  })
})

describe('a retirada local do consentimento (spec 189 T9.2)', () => {
  it('avisa quem escuta na hora, uma vez por mudança, e para de avisar quem saiu', () => {
    const revocation = createLocationConsentRevocation()
    const heard: boolean[] = []
    const unsubscribe = revocation.subscribe(() => heard.push(revocation.isRevoked()))

    expect(revocation.isRevoked()).toBe(false)
    revocation.revoke()
    revocation.revoke()
    revocation.restore()
    unsubscribe()
    revocation.revoke()

    expect(heard).toEqual([true, false])
    expect(revocation.isRevoked()).toBe(true)
  })
})

describe('o comentário da posição na cópia (plan D3)', () => {
  it('driverLocation.service.ts cita o consentimento, não mais "nunca watchPosition"', () => {
    const source = readFileSync(
      new URL('../../src/modules/driver-trip/shared/driverLocation.service.ts', import.meta.url),
      'utf8',
    ).replaceAll(/\s*\n\s*\*\s*/gu, ' ')

    expect(source).toContain('posição contínua só com consentimento (ADR-0050 §5, ADR-0075 §8)')
    expect(source).not.toContain('nunca `watchPosition`')
  })
})
