import { describe, expect, it } from 'bun:test'

import {
  buildDriverConversationPath,
  buildDriverRoutePath,
  DRIVER_ROUTE_PATH,
  navigateToDriverConversation,
  parseDriverConversationSubject,
  resolveDriverRouteSection,
  subscribeDriverRoute,
  type DriverRouteSection,
} from '../../src/modules/shared/driverRoute.service'

describe('driverRoute (RF5, ADR-0075 §6)', () => {
  it('resolve as seis seções pelo caminho', () => {
    expect(resolveDriverRouteSection('/')).toBe('trip')
    expect(resolveDriverRouteSection('/perfil')).toBe('profile')
    expect(resolveDriverRouteSection('/fila')).toBe('queue')
    expect(resolveDriverRouteSection('/fotos')).toBe('pending-proofs')
    expect(resolveDriverRouteSection('/notificacoes')).toBe('notifications')
    expect(resolveDriverRouteSection('/conversas')).toBe('conversations')
  })

  it('a conversa de um assunto também é a seção conversations', () => {
    expect(resolveDriverRouteSection('/conversas/occurrence/abc')).toBe('conversations')
  })

  it('ida e volta do assunto da conversa, com segmentos codificados', () => {
    const subject = { subjectId: 'a/b c?d', subjectType: 'occurrence' }
    const path = buildDriverConversationPath(subject)
    expect(path).toBe('/conversas/occurrence/a%2Fb%20c%3Fd')
    expect(parseDriverConversationSubject(path)).toEqual(subject)
  })

  it('a lista e caminhos malformados não têm assunto', () => {
    expect(parseDriverConversationSubject('/conversas')).toBeUndefined()
    expect(parseDriverConversationSubject('/conversas/occurrence')).toBeUndefined()
    expect(parseDriverConversationSubject('/conversas/occurrence/x/y')).toBeUndefined()
    expect(parseDriverConversationSubject('/conversas/occurrence/%E0%A4%A')).toBeUndefined()
    expect(parseDriverConversationSubject('/fila/occurrence/x')).toBeUndefined()
  })

  it('navegar ao assunto empurra o histórico uma vez só', () => {
    const pushed: string[] = []
    Object.assign(globalThis, { PopStateEvent: class PopStateEvent extends Event {} })
    const target = {
      dispatchEvent: () => true,
      history: {
        pushState: (_state: unknown, _title: string, url?: string | URL | null) =>
          void pushed.push(String(url)),
      },
      location: { pathname: '/conversas' },
    }
    navigateToDriverConversation({ subjectId: 'x', subjectType: 'occurrence' }, target)
    expect(pushed).toEqual(['/conversas/occurrence/x'])
    navigateToDriverConversation(
      { subjectId: 'x', subjectType: 'occurrence' },
      { ...target, location: { pathname: '/conversas/occurrence/x' } },
    )
    expect(pushed).toHaveLength(1)
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
