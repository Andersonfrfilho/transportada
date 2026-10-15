import { describe, expect, it } from 'bun:test'

import {
  buildDriverConversationPath,
  buildDriverOccurrenceListPath,
  buildDriverOccurrencePath,
  buildDriverRoutePath,
  DRIVER_ROUTE_PATH,
  navigateToDriverConversation,
  navigateToDriverOccurrence,
  navigateToDriverOccurrenceList,
  parseDriverConversationSubject,
  parseDriverOccurrenceListFilter,
  parseDriverOccurrenceRoute,
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

describe('rotas das ocorrências da rota (spec 266 T4.4)', () => {
  function createFakeTarget(pathname: string) {
    const pushed: string[] = []
    const events: Event[] = []
    return {
      events,
      pushed,
      target: {
        dispatchEvent: (event: Event) => {
          events.push(event)
          return true
        },
        history: {
          pushState: (_state: unknown, _title: string, url?: string | URL | null) => {
            pushed.push(String(url))
          },
        },
        location: { pathname },
      },
    }
  }

  it('/ocorrencias é a seção occurrences, com o detalhe dentro dela', () => {
    expect(DRIVER_ROUTE_PATH.occurrences).toBe('/ocorrencias')
    expect(resolveDriverRouteSection('/ocorrencias')).toBe('occurrences')
    expect(resolveDriverRouteSection('/ocorrencias/document/abc')).toBe('occurrences')
  })

  it('monta e lê /ocorrencias/:kind/:id', () => {
    const path = buildDriverOccurrencePath({ id: 'a/b', kind: 'document' })
    expect(path).toBe('/ocorrencias/document/a%2Fb')
    expect(parseDriverOccurrenceRoute(path)).toEqual({ id: 'a/b', kind: 'document' })
    expect(parseDriverOccurrenceRoute('/ocorrencias/stop/x')).toEqual({ id: 'x', kind: 'stop' })
  })

  it('a lista, kind desconhecido, segmentos a mais ou malformado não são detalhe', () => {
    expect(parseDriverOccurrenceRoute('/ocorrencias')).toBeUndefined()
    expect(parseDriverOccurrenceRoute('/ocorrencias/other/x')).toBeUndefined()
    expect(parseDriverOccurrenceRoute('/ocorrencias/document/x/y')).toBeUndefined()
    expect(parseDriverOccurrenceRoute('/ocorrencias/document/%E0%A4%A')).toBeUndefined()
    expect(parseDriverOccurrenceRoute('/conversas/document/x')).toBeUndefined()
  })

  it('o filtro da lista vai na query: ?nota= ou ?parada=', () => {
    expect(buildDriverOccurrenceListPath({})).toBe('/ocorrencias')
    expect(buildDriverOccurrenceListPath({ documentId: 'd 1' })).toBe('/ocorrencias?nota=d%201')
    expect(buildDriverOccurrenceListPath({ stopId: 's1' })).toBe('/ocorrencias?parada=s1')
    expect(parseDriverOccurrenceListFilter('?nota=d%201')).toEqual({ documentId: 'd 1' })
    expect(parseDriverOccurrenceListFilter('?parada=s1')).toEqual({ stopId: 's1' })
    expect(parseDriverOccurrenceListFilter('')).toEqual({})
    expect(parseDriverOccurrenceListFilter('?nota=')).toEqual({})
  })

  it('navega por pushState + popstate, sem repetir o mesmo caminho', () => {
    const fake = createFakeTarget('/')
    navigateToDriverOccurrence({ id: 'x', kind: 'stop' }, fake.target)
    expect(fake.pushed).toEqual(['/ocorrencias/stop/x'])
    expect(fake.events).toHaveLength(1)

    const same = createFakeTarget('/ocorrencias/stop/x')
    navigateToDriverOccurrence({ id: 'x', kind: 'stop' }, same.target)
    expect(same.pushed).toEqual([])
  })

  it('a lista filtrada sempre empurra: o filtro vive na query, que o pathname não vê', () => {
    const fake = createFakeTarget('/ocorrencias')
    navigateToDriverOccurrenceList({ documentId: 'd1' }, fake.target)
    expect(fake.pushed).toEqual(['/ocorrencias?nota=d1'])
  })
})
