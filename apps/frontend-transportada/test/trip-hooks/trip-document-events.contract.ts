/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 233 T5.3 (RF7, D11): "Eventos desta entrega" na nota aberta. Prova pelo **DOM renderizado**:
 * a consulta é filtrada pela nota no servidor, só dispara com a nota aberta e com a leitura da
 * timeline, o `departed` da própria nota diz "Saída para esta parada", e o raio só aparece com o dado.
 * Dados sintéticos.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import { i18n } from '../../src/modules/shared/i18n/i18n.service'
import { TripDocumentEvents } from '../../src/modules/trip/components/TripDocumentEvents.component'
import type { TripTimelineItem } from '../../src/modules/trip/shared/trip.types'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { settle } from './renderHook.helper'

type TimelineRequest = Readonly<{
  cursor: null | string
  documentId?: string
  limit: number
  tripId: string
}>

let root: Root | undefined
let container: HTMLDivElement | undefined

function makeItem(id: string, kind: TripTimelineItem['kind'], occurredAt: string) {
  return {
    actorName: null,
    channel: null,
    closeReason: null,
    document: { id: 'doc-1', number: '123', series: '1' },
    fromStatus: null,
    id,
    kind,
    location: null,
    locationState: null,
    occurrence: null,
    occurredAt,
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: { id: 'stop-1', sequence: 2 },
    toStatus: null,
  } as unknown as TripTimelineItem
}

/** Ordem da API: do mais recente para o mais antigo. */
const ITEMS = [
  makeItem('e3', 'document.delivered', '2026-10-01T13:00:00.000Z'),
  makeItem('e2', 'stop.arrived', '2026-10-01T12:30:00.000Z'),
  makeItem('e1', 'stop.departed', '2026-10-01T12:00:00.000Z'),
]

async function renderEvents(
  options: Readonly<{ permissions?: readonly string[]; proofRadiusMeters?: number }> = {},
): Promise<{ dom: HTMLElement; requests: TimelineRequest[] }> {
  const requests: TimelineRequest[] = []
  resetTripHookFakes([])
  fakes.tripClient = {
    ...fakes.tripClient,
    readTripTimeline: (input: TimelineRequest) => {
      requests.push(input)
      return Promise.resolve({ items: ITEMS, nextCursor: null })
    },
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(TripDocumentEvents, {
          documentId: 'doc-1',
          permissions: options.permissions ?? ['fleet.read'],
          ...(options.proofRadiusMeters === undefined
            ? {}
            : { proofRadiusMeters: options.proofRadiusMeters }),
          tripId: 'trip-1',
        }),
      ),
    )
    await Promise.resolve()
  })
  await settle()
  return { dom: container, requests }
}

afterEach(async () => {
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  await i18n.changeLanguage('pt-BR')
})

describe('Eventos desta entrega (spec 233 T5.3)', () => {
  it('pede a linha do tempo filtrada pela nota, com a permissão de leitura da timeline', async () => {
    const { requests } = await renderEvents()

    expect(requests).toHaveLength(1)
    expect(requests[0]?.documentId).toBe('doc-1')
    expect(requests[0]?.tripId).toBe('trip-1')
  })

  it('sem a leitura da timeline, não pede nada e não desenha a seção', async () => {
    const { dom, requests } = await renderEvents({ permissions: ['trip.manage'] })

    expect(requests).toHaveLength(0)
    expect(dom.textContent).not.toContain('Eventos desta entrega')
  })

  it('mostra o título, os eventos da nota em ordem cronológica e o rótulo D11', async () => {
    const { dom } = await renderEvents()

    expect(dom.querySelector('h4')?.textContent).toBe('Eventos desta entrega')
    const titles = [...dom.querySelectorAll('ol > li p')].map((node) => node.textContent)
    expect(titles[0]).toBe('Saída para esta parada')
    expect(titles[1]).toBe('Chegada na parada 2')
    expect(titles[2]).toContain('123/1')
    expect(dom.textContent).not.toContain('A caminho da parada')
  })

  it('em inglês usa as mesmas chaves', async () => {
    await i18n.changeLanguage('en')
    const { dom } = await renderEvents()

    expect(dom.querySelector('h4')?.textContent).toBe('Events for this delivery')
    expect(dom.textContent).toContain('Departure for this stop')
  })

  it('o raio só aparece quando a API devolveu proofRadiusMeters', async () => {
    const withRadius = await renderEvents({ proofRadiusMeters: 300 })
    expect(withRadius.dom.textContent).toContain('Raio tolerado da parada: 300 m')
    act(() => root?.unmount())
    container?.remove()

    const without = await renderEvents()
    expect(without.dom.textContent).not.toContain('Raio tolerado')
    expect(without.dom.textContent).not.toMatch(/\b\d+ m\b/u)
  })

  it('não inventa os eventos da spec 228', async () => {
    const { dom } = await renderEvents({ proofRadiusMeters: 300 })

    expect(dom.textContent).not.toContain('Foto do canhoto')
    expect(dom.textContent).not.toContain('Endereço geocodificado')
  })
})
