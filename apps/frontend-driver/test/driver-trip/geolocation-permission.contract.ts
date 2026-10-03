/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  watchGeolocationPermission,
  type GeolocationPermissionSource,
} from '../../src/modules/driver-trip/shared/geolocationPermission.service'

/** O `PermissionStatus` que o navegador devolve: o estado atual e o evento `change`. */
function createFakeStatus(initialState: string) {
  const listeners = new Set<() => void>()
  const status = {
    addEventListener: (_type: 'change', listener: () => void) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: 'change', listener: () => void) => {
      listeners.delete(listener)
    },
    state: initialState,
  }
  return {
    change: (nextState: string) => {
      status.state = nextState
      for (const listener of [...listeners]) listener()
    },
    listenerCount: () => listeners.size,
    status,
  }
}

function createSource(fake: ReturnType<typeof createFakeStatus>) {
  const descriptors: unknown[] = []
  const source: GeolocationPermissionSource = {
    query: (descriptor) => {
      descriptors.push(descriptor)
      return Promise.resolve(fake.status)
    },
  }
  return { descriptors, source }
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/**
 * Spec 234 D4d: o cartão avisa antes do "Entreguei" quando a permissão de localização está negada.
 * Nunca bloqueia o toque, então qualquer falha da Permissions API vale "não mostra nada".
 */
describe('o acompanhamento da permissão de localização (spec 234 D4d)', () => {
  it('pergunta pela permissão "geolocation"', async () => {
    const { descriptors, source } = createSource(createFakeStatus('granted'))

    watchGeolocationPermission({ onChange: () => undefined, permissions: source })
    await settle()

    expect(descriptors).toEqual([{ name: 'geolocation' }])
  })

  it('denied: avisa que está negada', async () => {
    const { source } = createSource(createFakeStatus('denied'))
    const seen: boolean[] = []

    watchGeolocationPermission({ onChange: (isDenied) => seen.push(isDenied), permissions: source })
    await settle()

    expect(seen).toEqual([true])
  })

  it('granted e prompt: nunca avisam', async () => {
    for (const state of ['granted', 'prompt']) {
      const { source } = createSource(createFakeStatus(state))
      const seen: boolean[] = []

      watchGeolocationPermission({
        onChange: (isDenied) => seen.push(isDenied),
        permissions: source,
      })
      await settle()

      expect(seen).not.toContain(true)
    }
  })

  it('sem a Permissions API não há nada a mostrar, e nada quebra', async () => {
    const seen: boolean[] = []

    const stop = watchGeolocationPermission({
      onChange: (isDenied) => seen.push(isDenied),
      permissions: undefined,
    })
    await settle()
    stop()

    expect(seen).toEqual([])
  })

  it('a consulta que lança (síncrona ou rejeitada) não mostra nada nem derruba', async () => {
    const seen: boolean[] = []
    const throwing: GeolocationPermissionSource = {
      query: () => {
        throw new TypeError('geolocation is not a valid permission')
      },
    }
    const rejecting: GeolocationPermissionSource = {
      query: () => Promise.reject(new TypeError('Illegal invocation')),
    }

    for (const source of [throwing, rejecting]) {
      const stop = watchGeolocationPermission({
        onChange: (isDenied) => seen.push(isDenied),
        permissions: source,
      })
      await settle()
      stop()
    }

    expect(seen).toEqual([])
  })

  it('o evento change atualiza: concedida vira negada e volta', async () => {
    const fake = createFakeStatus('granted')
    const seen: boolean[] = []
    watchGeolocationPermission({
      onChange: (isDenied) => seen.push(isDenied),
      permissions: createSource(fake).source,
    })
    await settle()

    fake.change('denied')
    fake.change('granted')

    expect(seen).toEqual([false, true, false])
  })

  it('parar remove o ouvinte, e nada mais é avisado', async () => {
    const fake = createFakeStatus('granted')
    const seen: boolean[] = []
    const stop = watchGeolocationPermission({
      onChange: (isDenied) => seen.push(isDenied),
      permissions: createSource(fake).source,
    })
    await settle()
    expect(fake.listenerCount()).toBe(1)

    stop()
    fake.change('denied')

    expect(fake.listenerCount()).toBe(0)
    expect(seen).toEqual([false])
  })

  it('parar antes de a consulta responder: nada é ligado nem avisado', async () => {
    const fake = createFakeStatus('denied')
    const seen: boolean[] = []
    const stop = watchGeolocationPermission({
      onChange: (isDenied) => seen.push(isDenied),
      permissions: createSource(fake).source,
    })

    stop()
    await settle()

    expect(fake.listenerCount()).toBe(0)
    expect(seen).toEqual([])
  })
})
