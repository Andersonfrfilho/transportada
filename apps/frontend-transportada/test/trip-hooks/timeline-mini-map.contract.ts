/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O minimapa da linha do tempo no DOM: estado vazio honesto, nota de carga parcial, contagem do que
 * ficou sem posição e lista acessível dos pontos. Dados sintéticos; o mapa WebGL é substituído.
 */
import { readFileSync } from 'node:fs'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, mock } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'

void mock.module('../../src/modules/trip/components/AssemblyVectorMap.component', () => ({
  AssemblyVectorMap: () => createElement('div', { 'data-testid': 'vector-map' }),
}))

const { TripTimeline } = await import('../../src/modules/trip/components/TripTimeline.component')
import type { TripTimelineItem } from '../../src/modules/trip/shared/trip.types'

let root: Root | undefined
let container: HTMLDivElement | undefined

function makeItem(id: string, overrides: Partial<TripTimelineItem>): TripTimelineItem {
  return {
    actorName: 'Marina Alves',
    channel: 'driver_app',
    closeReason: null,
    document: null,
    fromStatus: null,
    id,
    kind: 'stop.arrived',
    occurrence: null,
    occurredAt: '2026-09-18T12:00:00',
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: null,
    toStatus: null,
    ...overrides,
  }
}

function makeLocated(id: string, latitude: number, overrides: Partial<TripTimelineItem> = {}) {
  return makeItem(id, {
    location: {
      accuracyMeters: 5,
      capturedAt: '2026-09-18T12:00:00',
      distanceMeters: null,
      latitude,
      longitude: -46.63,
    },
    locationState: 'captured',
    ...overrides,
  })
}

async function renderTimeline(
  items: readonly TripTimelineItem[],
  hasNextPage = false,
): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const query = {
    data: { pages: [{ items, nextCursor: null }] },
    fetchNextPage: () => undefined,
    hasNextPage,
    isError: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: () => undefined,
  }
  await act(async () => {
    root?.render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(TripTimeline, { openDocumentId: null, query }),
      ),
    )
    await Promise.resolve()
  })
  return container
}

afterEach(() => {
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('minimapa da linha do tempo (DOM)', () => {
  it('zero eventos com posição: estado vazio honesto, sem mapa nem legenda', async () => {
    const dom = await renderTimeline([makeItem('a', {}), makeItem('b', { locationState: null })])

    expect(dom.textContent).toInclude('Nenhum evento desta viagem tem posição registrada')
    expect(dom.querySelector('[data-testid="vector-map"]')).toBeNull()
    expect(dom.querySelector('[aria-label="Tipos de evento no mapa"]')).toBeNull()
  })

  it('com posição: renderiza o mapa, a legenda e a lista acessível em ordem', async () => {
    const dom = await renderTimeline([
      makeLocated('a', -23.5, { kind: 'document.delivered', occurredAt: '2026-09-18T15:00:00' }),
      makeLocated('b', -23.6, { kind: 'stop.arrived', occurredAt: '2026-09-18T13:00:00' }),
    ])

    expect(dom.querySelector('[data-testid="vector-map"]')).not.toBeNull()
    const legend = dom.querySelector('[aria-label="Tipos de evento no mapa"]')
    expect(legend?.textContent).toInclude('Entrega')
    expect(legend?.textContent).toInclude('Chegada')
    const lines = [...dom.querySelectorAll('details ol li')].map((line) => line.textContent ?? '')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toInclude('Chegada')
    expect(lines[1]).toInclude('Entrega')
  })

  it('a lista dos pontos abre por um <summary> com área de toque de 44px', async () => {
    const dom = await renderTimeline([makeLocated('a', -23.5)])
    const summary = dom.querySelector('details > summary')

    expect(summary).not.toBeNull()
    const css = readFileSync(
      new URL('../../src/modules/trip/styles/tripTimelineMiniMap.module.css', import.meta.url),
      'utf8',
    )
    expect(css).toMatch(/\.pointListSummary \{[^}]*min-height: 2\.75rem;/u)
  })

  it('dezenas de eventos no mesmo lugar viram um ponto só, com a contagem', async () => {
    const items = Array.from({ length: 30 }, (_, index) => makeLocated(`i${index}`, -23.55))
    const dom = await renderTimeline(items)

    expect(dom.querySelectorAll('details ol li')).toHaveLength(1)
    expect(dom.querySelector('details ol li')?.textContent).toInclude('30 eventos')
  })

  it('conta separado o que ficou sem posição, sem fingir que está no mapa', async () => {
    const dom = await renderTimeline([
      makeLocated('a', -23.5),
      makeItem('u', { locationState: 'unavailable' }),
      makeItem('e', { locationState: 'expired' }),
      makeItem('r', { locationState: 'captured' }),
    ])

    expect(dom.textContent).toInclude('1 evento sem posição')
    expect(dom.textContent).toInclude('1 evento com posição apagada')
    expect(dom.textContent).toInclude('oculta para o seu acesso')
  })

  it('avisa que o mapa cobre só o carregado quando há mais páginas', async () => {
    const dom = await renderTimeline([makeLocated('a', -23.5)], true)

    expect(dom.textContent).toInclude('só os eventos já carregados')
  })

  it('não imprime coordenada no minimapa', async () => {
    const dom = await renderTimeline([makeLocated('a', -23.55)])
    const mapSection = dom.querySelector('#trip-timeline-map-title')?.parentElement

    expect(mapSection?.textContent).not.toInclude('-23.55')
    expect(mapSection?.textContent).not.toInclude('-46.63')
  })
})
