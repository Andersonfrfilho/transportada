/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A linha do tempo no DOM: ícone no lugar das iniciais, chips só com dado, intervalo pequeno em
 * texto e intervalo grande em régua. Dados sintéticos.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripTimeline } from '../../src/modules/trip/components/TripTimeline.component'
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
    stop: { id: 'stop-5', sequence: 5 },
    toStatus: null,
    ...overrides,
  }
}

function renderTimeline(items: readonly TripTimelineItem[]): HTMLElement {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const query = {
    data: { pages: [{ items, nextCursor: null }] },
    fetchNextPage: () => undefined,
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: () => undefined,
  }
  act(() => {
    root?.render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(TripTimeline, { openDocumentId: null, query }),
      ),
    )
  })
  return container
}

afterEach(() => {
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('linha do tempo redesenhada (DOM)', () => {
  it('cada linha tem ícone SVG no lugar das iniciais, e a parada vira chip', () => {
    const dom = renderTimeline([makeItem('a', {})])

    expect(dom.querySelector('li svg')).not.toBeNull()
    expect(dom.textContent).not.toInclude('MA')
    expect(dom.textContent).toInclude('Parada 5')
  })

  it('sem parada, transição nem registro tardio, não há lista de chips', () => {
    const dom = renderTimeline([makeItem('a', { stop: null })])

    expect(dom.querySelector('ul')).toBeNull()
  })

  it('transição de situação e registro tardio aparecem como chips', () => {
    const dom = renderTimeline([
      makeItem('a', {
        channel: 'office',
        fromStatus: 'on_delivery_route',
        kind: 'trip.status_changed',
        recordedAt: '2026-09-18T12:25:00',
        stop: null,
        toStatus: 'completed',
      }),
    ])

    expect(dom.textContent).toInclude('Em rota de entrega → Concluída')
    expect(dom.textContent).toInclude('registrado 25 min depois')
  })

  it('evento 3 min depois do anterior diz "3 min após o evento anterior", sem régua', () => {
    const dom = renderTimeline([
      makeItem('new', { occurredAt: '2026-09-18T12:03:00' }),
      makeItem('old', { occurredAt: '2026-09-18T12:00:00' }),
    ])

    expect(dom.textContent).toInclude('3 min após o evento anterior')
    expect(dom.textContent).not.toInclude('sem registro')
  })

  it('intervalo de 7 h 25 min no mesmo dia vira régua "sem registro"', () => {
    const dom = renderTimeline([
      makeItem('new', { occurredAt: '2026-09-18T15:25:00' }),
      makeItem('old', { occurredAt: '2026-09-18T08:00:00' }),
    ])

    expect(dom.textContent).toInclude('7 h 25 min sem registro')
  })
})
