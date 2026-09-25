/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  IDENTITY_PROBE_TIMEOUT_MS,
  probeIdentityProvider,
  resolveBootMode,
  scheduleAuthenticationOnReconnect,
  type ProbeFetch,
  type ReconnectTarget,
} from '@/modules/driver-trip/shared/bootMode.service'
import { createCaptureRegistry } from '@/modules/driver-trip/shared/captureRegistry.service'
import type { DriverTripSnapshot } from '@/modules/driver-trip/shared/driverTrip.types'
import type { OwnedTripSnapshot } from '@/modules/driver-trip/shared/tripSnapshot.service'

const NOW = new Date('2026-09-25T12:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000
const KEYCLOAK_URL = 'https://auth.example.test'
const REALM = 'transportada'
const MAIN = new URL('../../src/main.tsx', import.meta.url)
const HOOK = new URL('../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts', import.meta.url)

function snapshotWith(statuses: readonly string[]): DriverTripSnapshot {
  return {
    isRegisteredDriver: true,
    pendingProofs: [],
    score: null,
    trips: statuses.map((status, index) => ({
      id: `trip-${index}`,
      manifest: null,
      status,
      stops: [],
      vehiclePlate: 'ABC1D23',
    })),
  }
}

function ownedSnapshot(input: {
  hoursAgo: number
  statuses?: readonly string[]
}): OwnedTripSnapshot {
  return {
    savedAt: new Date(NOW.getTime() - input.hoursAgo * HOUR_MS).toISOString(),
    snapshot: snapshotWith(input.statuses ?? ['on_delivery_route']),
    subHash: 'a'.repeat(64),
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function createFakeTarget(): ReconnectTarget & {
  readonly fireOnline: () => void
  readonly fireInterval: () => void
  readonly listenerCount: () => number
  readonly intervalCount: () => number
} {
  const listeners = new Set<() => void>()
  const intervals = new Map<number, () => void>()
  let nextId = 1

  return {
    addEventListener: (_type, listener) => listeners.add(listener),
    clearInterval: (id) => intervals.delete(id),
    fireInterval: () => {
      for (const handler of [...intervals.values()]) handler()
    },
    fireOnline: () => {
      for (const listener of [...listeners]) listener()
    },
    intervalCount: () => intervals.size,
    listenerCount: () => listeners.size,
    removeEventListener: (_type, listener) => listeners.delete(listener),
    setInterval: (handler) => {
      const id = nextId
      nextId += 1
      intervals.set(id, handler)
      return id
    },
  }
}

describe('probeIdentityProvider (plan D4, ADR-0075 §8)', () => {
  it('sonda o openid-configuration do realm, sem cache e com prazo', async () => {
    const calls: Array<{ url: string; init: Parameters<ProbeFetch>[1] }> = []
    const fetch: ProbeFetch = (url, init) => {
      calls.push({ init, url })
      return Promise.resolve({ ok: true })
    }

    const isReachable = await probeIdentityProvider({
      fetch,
      keycloakUrl: KEYCLOAK_URL,
      realm: REALM,
    })

    expect(isReachable).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://auth.example.test/realms/transportada/.well-known/openid-configuration',
    )
    expect(calls[0]?.init.cache).toBe('no-store')
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal)
    expect(IDENTITY_PROBE_TIMEOUT_MS).toBe(5_000)
  })

  it('rede fora do ar é inalcançável, nunca exceção', async () => {
    const fetch: ProbeFetch = () => Promise.reject(new TypeError('Failed to fetch'))

    expect(await probeIdentityProvider({ fetch, keycloakUrl: KEYCLOAK_URL, realm: REALM })).toBe(
      false,
    )
  })

  it('resposta de erro (proxy sem o Keycloak atrás) é inalcançável', async () => {
    const fetch: ProbeFetch = () => Promise.resolve({ ok: false })

    expect(await probeIdentityProvider({ fetch, keycloakUrl: KEYCLOAK_URL, realm: REALM })).toBe(
      false,
    )
  })

  it('sinal fraco: a sonda que não responde no prazo é abortada e dá inalcançável', async () => {
    const fetch: ProbeFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('PROBE_ABORTED')))
      })

    const isReachable = await probeIdentityProvider({
      fetch,
      keycloakUrl: KEYCLOAK_URL,
      realm: REALM,
      timeoutMs: 10,
    })

    expect(isReachable).toBe(false)
  })
})

describe('resolveBootMode (plan D4)', () => {
  it('Keycloak alcançável autentica, com ou sem snapshot', () => {
    expect(resolveBootMode({ isReachable: true, now: NOW, snapshot: undefined })).toBe(
      'authenticate',
    )
    expect(
      resolveBootMode({ isReachable: true, now: NOW, snapshot: ownedSnapshot({ hoursAgo: 1 }) }),
    ).toBe('authenticate')
  })

  it('inalcançável com snapshot válido abre o snapshot', () => {
    expect(
      resolveBootMode({ isReachable: false, now: NOW, snapshot: ownedSnapshot({ hoursAgo: 23 }) }),
    ).toBe('offline-snapshot')
  })

  it('inalcançável sem snapshot abre a tela vazia', () => {
    expect(resolveBootMode({ isReachable: false, now: NOW, snapshot: undefined })).toBe(
      'offline-empty',
    )
  })

  it('snapshot com mais de 24 h não abre', () => {
    expect(
      resolveBootMode({ isReachable: false, now: NOW, snapshot: ownedSnapshot({ hoursAgo: 25 }) }),
    ).toBe('offline-empty')
  })

  it('snapshot com todas as viagens concluídas não abre', () => {
    const snapshot = ownedSnapshot({ hoursAgo: 1, statuses: ['completed', 'cancelled'] })

    expect(resolveBootMode({ isReachable: false, now: NOW, snapshot })).toBe('offline-empty')
  })
})

describe('autenticação adiada à volta da rede (plan D4)', () => {
  it('no online, sonda e autentica com o registro de capturas vazio', async () => {
    const target = createFakeTarget()
    let authenticateCalls = 0

    scheduleAuthenticationOnReconnect({
      authenticate: () => {
        authenticateCalls += 1
        return Promise.resolve()
      },
      captureRegistry: createCaptureRegistry(),
      probe: () => Promise.resolve(true),
      target,
    })

    expect(authenticateCalls).toBe(0)
    target.fireOnline()
    await flush()

    expect(authenticateCalls).toBe(1)
    expect(target.listenerCount()).toBe(0)
    expect(target.intervalCount()).toBe(0)
  })

  it('online sem Keycloak respondendo continua esperando', async () => {
    const target = createFakeTarget()
    let isReachable = false
    let authenticateCalls = 0

    scheduleAuthenticationOnReconnect({
      authenticate: () => {
        authenticateCalls += 1
        return Promise.resolve()
      },
      captureRegistry: createCaptureRegistry(),
      probe: () => Promise.resolve(isReachable),
      target,
    })

    target.fireOnline()
    await flush()
    expect(authenticateCalls).toBe(0)
    expect(target.listenerCount()).toBe(1)

    isReachable = true
    target.fireOnline()
    await flush()
    expect(authenticateCalls).toBe(1)
  })

  it('com captura aberta, o keycloak.init espera o close', async () => {
    const target = createFakeTarget()
    const captureRegistry = createCaptureRegistry()
    let probeCalls = 0
    let authenticateCalls = 0

    scheduleAuthenticationOnReconnect({
      authenticate: () => {
        authenticateCalls += 1
        return Promise.resolve()
      },
      captureRegistry,
      probe: () => {
        probeCalls += 1
        return Promise.resolve(true)
      },
      target,
    })

    captureRegistry.open('camera')
    target.fireOnline()
    await flush()
    expect(authenticateCalls).toBe(0)

    captureRegistry.close('camera')
    await flush()

    expect(authenticateCalls).toBe(1)
    /** O `close` sonda de novo: a rede pode ter caído durante a captura. */
    expect(probeCalls).toBe(2)
  })

  it('sinal fraco (online nunca dispara): o temporizador sonda de novo', async () => {
    const target = createFakeTarget()
    let isReachable = false
    let authenticateCalls = 0

    scheduleAuthenticationOnReconnect({
      authenticate: () => {
        authenticateCalls += 1
        return Promise.resolve()
      },
      captureRegistry: createCaptureRegistry(),
      probe: () => Promise.resolve(isReachable),
      target,
    })

    target.fireInterval()
    await flush()
    expect(authenticateCalls).toBe(0)

    isReachable = true
    target.fireInterval()
    await flush()
    expect(authenticateCalls).toBe(1)
  })

  it('autentica uma vez só, mesmo com online e temporizador juntos', async () => {
    const target = createFakeTarget()
    let authenticateCalls = 0

    scheduleAuthenticationOnReconnect({
      authenticate: () => {
        authenticateCalls += 1
        return Promise.resolve()
      },
      captureRegistry: createCaptureRegistry(),
      probe: () => Promise.resolve(true),
      target,
    })

    target.fireOnline()
    target.fireInterval()
    target.fireOnline()
    await flush()

    expect(authenticateCalls).toBe(1)
  })

  it('cancelar desliga o ouvinte e o temporizador', () => {
    const target = createFakeTarget()

    const cancel = scheduleAuthenticationOnReconnect({
      authenticate: () => Promise.resolve(),
      captureRegistry: createCaptureRegistry(),
      probe: () => Promise.resolve(true),
      target,
    })
    cancel()

    expect(target.listenerCount()).toBe(0)
    expect(target.intervalCount()).toBe(0)
  })
})

describe('o boot decide antes do keycloak.init (ADR-0075 §8)', () => {
  const main = readFileSync(MAIN, 'utf8')

  /**
   * O `check-sso` sem `silentCheckSsoRedirectUri` navega a página inteira: nenhuma exceção do
   * `init` chega ao código, então esperar a falha dele não serve. A sonda vem antes.
   */
  it('no boot, a sonda e a decisão vêm antes de qualquer caminho até o init', () => {
    const boot = main.slice(main.indexOf('async function start('))
    const probeIndex = boot.indexOf('probeKeycloak()')
    const decisionIndex = boot.indexOf('resolveBootMode(')
    const authenticateIndex = boot.indexOf('startAuthenticated(root)')

    expect(main).toInclude('probeIdentityProvider(')
    expect(probeIndex).toBeGreaterThan(-1)
    expect(decisionIndex).toBeGreaterThan(probeIndex)
    expect(authenticateIndex).toBeGreaterThan(decisionIndex)
    /** O `init` só existe dentro do caminho autenticado — nunca solto no boot. */
    expect(boot).not.toInclude('initializeKeycloakAuth()')
    expect(main.match(/initializeKeycloakAuth\(\)/g)?.length).toBe(1)
    expect(main).toInclude('scheduleAuthenticationOnReconnect(')
    expect(main).not.toInclude('navigator.onLine')
  })

  it('a viagem vem do snapshot guardado, e a drenagem só manda o que é do usuário', () => {
    const hook = readFileSync(HOOK, 'utf8')

    expect(hook).toInclude('initialData')
    expect(hook).toInclude('initialDataUpdatedAt')
    expect(hook).toInclude('saveTripSnapshot(')
    expect(hook).toInclude('ownerSubHash: session.subHash')
  })
})
