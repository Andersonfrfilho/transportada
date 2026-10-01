/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196: os dois mapas da linha do tempo nasciam abertos. O de cima, o mapa dos eventos, media
 * 533px e empurrava a lista inteira para baixo da dobra antes de alguém pedir por ele. E o do
 * evento vinha dentro do mesmo "Ver mais" que mostra o texto: num evento de devolução o bloco media
 * 351px, dos quais 312 eram mapa, para entregar uma linha — "Motivo da devolução: Ausente".
 *
 * Os dois passam a abrir sob gesto. O do evento ganha um segundo gesto **só quando há texto junto**:
 * no evento cuja única informação é a posição, o "Ver mais" já se chama "Ver no mapa" e abrir um
 * botão de mesmo nome dentro do painel dele seria o absurdo de um controle que abre outro controle.
 * Esse caso é o que os dois últimos casos daqui separam.
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

const READING = {
  accuracyMeters: 12.4,
  capturedAt: '2026-09-18T12:00:00',
  distanceMeters: 850,
  latitude: -23.55,
  longitude: -46.63,
}

const BASE_ITEM: TripTimelineItem = {
  actorName: 'Marina Alves',
  channel: 'driver_app',
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'item-map-only',
  kind: 'stop.arrived',
  location: READING,
  locationState: 'captured',
  occurrence: null,
  occurredAt: '2026-09-18T12:00:00',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: { id: 'stop-5', sequence: 5 },
  toStatus: null,
}

/** Posição é tudo o que este evento tem: o "Ver mais" dele já é o botão do mapa. */
const MAP_ONLY_ITEM: TripTimelineItem = BASE_ITEM

/** Aqui há texto junto da posição — é o evento que pagava 312px de mapa para dar uma linha. */
const TEXT_AND_MAP_ITEM: TripTimelineItem = {
  ...BASE_ITEM,
  id: 'item-text-and-map',
  kind: 'document.returned',
  returnReason: 'recipient_refused',
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
        createElement(TripTimeline, { openDocumentId: null, query, stops: [] }),
      ),
    )
  })
  return container
}

function findButtonByLabel(host: HTMLElement, label: string): HTMLButtonElement {
  const button = [...host.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (button === undefined) throw new Error(`botão ausente: ${label}`)
  return button
}

function press(button: HTMLButtonElement): void {
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function panelOf(button: HTMLButtonElement): HTMLElement {
  const panelId = button.getAttribute('aria-controls')
  if (panelId === null) throw new Error('botão sem aria-controls')
  const panel = document.getElementById(panelId)
  if (panel === null) throw new Error(`painel ausente: ${panelId}`)
  return panel
}

afterEach(() => {
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('mapa dos eventos recolhido (spec 196)', () => {
  it('não desenha o mapa antes de alguém pedir — e o botão diz o que abre', () => {
    const host = renderTimeline([MAP_ONLY_ITEM])
    const toggle = findButtonByLabel(host, 'Ver o mapa dos eventos')

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(panelOf(toggle).children).toHaveLength(0)
    expect(host.textContent).not.toContain('Mapa dos eventos')
  })

  it('abre no gesto, e o rótulo passa a dizer como fechar', () => {
    const host = renderTimeline([MAP_ONLY_ITEM])
    const toggle = findButtonByLabel(host, 'Ver o mapa dos eventos')
    press(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panelOf(toggle).children.length).toBeGreaterThan(0)
    expect(host.textContent).toContain('Mapa dos eventos')
    expect(toggle.textContent?.trim()).toBe('Ocultar o mapa dos eventos')
  })
})

describe('mapa do evento sob segundo gesto (spec 196)', () => {
  it('o "Ver mais" entrega o texto sem o mapa junto', () => {
    const host = renderTimeline([TEXT_AND_MAP_ITEM])
    press(findButtonByLabel(host, 'Ver mais'))

    expect(host.textContent).toContain('Motivo da devolução')
    expect(host.querySelector('figure') === null).toBe(true)
  })

  it('e o mapa do evento chega no botão de dentro, ligado ao próprio painel', () => {
    const host = renderTimeline([TEXT_AND_MAP_ITEM])
    press(findButtonByLabel(host, 'Ver mais'))
    const mapToggle = findButtonByLabel(host, 'Ver no mapa')

    expect(mapToggle.getAttribute('aria-expanded')).toBe('false')
    expect(panelOf(mapToggle).children).toHaveLength(0)

    press(mapToggle)

    expect(mapToggle.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('figure') === null).toBe(false)
    expect(mapToggle.textContent?.trim()).toBe('Ocultar mapa')
  })

  /**
   * O caso que decide a forma: sem texto a esconder, um expansivo dentro do outro seria um botão
   * "Ver no mapa" abrindo um painel com um botão "Ver no mapa". O evento sem texto fica com um
   * gesto só, e é esse único botão que traz o mapa.
   */
  it('evento só com posição não ganha botão dentro de botão', () => {
    const host = renderTimeline([MAP_ONLY_ITEM])
    const toggle = findButtonByLabel(host, 'Ver no mapa')
    press(toggle)
    const detail = panelOf(toggle)

    expect(detail.querySelector('figure') === null).toBe(false)
    expect(detail.querySelector('button') === null).toBe(true)
  })
})
