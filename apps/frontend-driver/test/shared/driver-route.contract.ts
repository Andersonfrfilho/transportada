import { describe, expect, it } from 'bun:test'

import {
  buildDriverRoutePath,
  DRIVER_ROUTE_PATH,
  resolveDriverRouteSection,
  subscribeDriverRoute,
  type DriverRouteSection,
} from '../../src/modules/shared/driverRoute.service'

describe('driverRoute (RF5, ADR-0075 §6)', () => {
  it('resolve as cinco seções pelo caminho', () => {
    expect(resolveDriverRouteSection('/')).toBe('trip')
    expect(resolveDriverRouteSection('/perfil')).toBe('profile')
    expect(resolveDriverRouteSection('/fila')).toBe('queue')
    expect(resolveDriverRouteSection('/fotos')).toBe('pending-proofs')
    expect(resolveDriverRouteSection('/notificacoes')).toBe('notifications')
  })

  it('caminho desconhecido cai em trip', () => {
    expect(resolveDriverRouteSection('/qualquer-coisa')).toBe('trip')
    expect(resolveDriverRouteSection('')).toBe('trip')
  })

  it('aceita sub-caminho da seção', () => {
    expect(resolveDriverRouteSection('/notificacoes/123')).toBe('notifications')
  })

  it('buildDriverRoutePath é o inverso de resolveDriverRouteSection', () => {
    for (const section of Object.keys(DRIVER_ROUTE_PATH) as DriverRouteSection[]) {
      const path = buildDriverRoutePath(section)
      expect(resolveDriverRouteSection(path)).toBe(section)
    }
  })

  it('subscribeDriverRoute chama com a seção do popstate e permite cancelar', () => {
    const listeners: Array<() => void> = []
    let currentPathname = '/'
    const fakeTarget = {
      addEventListener: (_type: 'popstate', listener: () => void) => {
        listeners.push(listener)
      },
      location: {
        get pathname() {
          return currentPathname
        },
      },
      removeEventListener: (_type: 'popstate', listener: () => void) => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      },
    }

    const seen: DriverRouteSection[] = []
    const unsubscribe = subscribeDriverRoute((section) => seen.push(section), fakeTarget)

    currentPathname = '/perfil'
    for (const listener of listeners) listener()
    expect(seen).toEqual(['profile'])

    unsubscribe()
    currentPathname = '/fila'
    for (const listener of listeners) listener()
    expect(seen).toEqual(['profile'])
  })
})
