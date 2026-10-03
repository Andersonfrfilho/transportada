/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 228 T4.1: a foto do canhoto e o endereço corrigido no DOM — na linha do tempo da viagem e em
 * "Eventos desta entrega". Origem, deslocamento, ator e "Ver no mapa" só com ponto. Dados sintéticos.
 */
import { readFileSync } from 'node:fs'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import { i18n } from '../../src/modules/shared/i18n/i18n.service'
import { TripDocumentEvents } from '../../src/modules/trip/components/TripDocumentEvents.component'
import { TripTimeline } from '../../src/modules/trip/components/TripTimeline.component'
import type { TripTimelineItem } from '../../src/modules/trip/shared/trip.types'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { settle } from './renderHook.helper'

let root: Root | undefined
let container: HTMLDivElement | undefined

const POINT = {
  accuracyMeters: 8,
  capturedAt: '2026-10-01T12:40:00.000Z',
  distanceMeters: 120,
  latitude: -23.5505,
  longitude: -46.6333,
} as const

function makeItem(id: string, overrides: Partial<TripTimelineItem>): TripTimelineItem {
  return {
    actorName: 'Marina Alves',
    channel: 'backoffice',
    closeReason: null,
    document: { id: 'doc-1', number: '123', series: '1' },
    fromStatus: null,
    id,
    kind: 'document.delivered',
    location: null,
    locationState: null,
    occurrence: null,
    occurredAt: '2026-10-01T12:30:00.000Z',
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: { id: 'stop-1', sequence: 2 },
    toStatus: null,
    ...overrides,
  }
}

const PHOTO_WITH_POINT = makeItem('photo', {
  channel: 'driver_app',
  kind: 'document.canhoto_photo',
  location: POINT,
  locationState: 'captured',
  occurredAt: '2026-10-01T12:40:00.000Z',
})
const PHOTO_WITHOUT_PERMISSION = makeItem('photo-hidden', {
  kind: 'document.canhoto_photo',
  location: null,
  locationState: 'captured',
})
const ADDRESS_WITH_POINT = makeItem('address', {
  addressChange: { displacementMeters: 45, origin: 'operator' },
  document: null,
  kind: 'stop.address_corrected',
  location: { ...POINT, accuracyMeters: null, distanceMeters: null },
  locationState: null,
  occurredAt: '2026-10-01T12:20:00.000Z',
})
const ADDRESS_REFINEMENT = makeItem('refinement', {
  addressChange: { displacementMeters: null, origin: 'refinement' },
  document: null,
  kind: 'stop.address_corrected',
  location: null,
  locationState: null,
  occurredAt: '2026-10-01T12:10:00.000Z',
})
const ADDRESS_LONG_MOVE = makeItem('address-km', {
  addressChange: { displacementMeters: 1500, origin: 'contractor' },
  document: null,
  kind: 'stop.address_corrected',
  location: null,
  locationState: null,
  occurredAt: '2026-10-01T12:05:00.000Z',
})

function mount(node: ReturnType<typeof createElement>): HTMLElement {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(createElement(QueryClientProvider, { client: new QueryClient() }, node))
  })
  return container
}

function renderTimeline(items: readonly TripTimelineItem[]): HTMLElement {
  const query = {
    data: { pages: [{ items, nextCursor: null }] },
    fetchNextPage: () => undefined,
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: () => undefined,
  }
  return mount(createElement(TripTimeline, { openDocumentId: null, query }))
}

async function renderDocumentEvents(items: readonly TripTimelineItem[]): Promise<HTMLElement> {
  resetTripHookFakes([])
  fakes.tripClient = {
    ...fakes.tripClient,
    readTripTimeline: () => Promise.resolve({ items, nextCursor: null }),
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        createElement(TripDocumentEvents, {
          documentId: 'doc-1',
          permissions: ['fleet.read'],
          tripId: 'trip-1',
        }),
      ),
    )
    await Promise.resolve()
  })
  await settle()
  return container
}

function viewMapButtons(dom: HTMLElement): readonly HTMLButtonElement[] {
  return [...dom.querySelectorAll('button')].filter(
    (button) => button.textContent === 'Ver no mapa',
  )
}

function entryOf(dom: HTMLElement, titleText: string): HTMLElement {
  const entry = [...dom.querySelectorAll('li')].find(
    (candidate) => candidate.querySelector('p')?.textContent === titleText,
  )
  if (entry === undefined) throw new Error(`entrada ausente: ${titleText}`)
  return entry
}

afterEach(async () => {
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  await i18n.changeLanguage('pt-BR')
})

describe('linha do tempo da viagem: foto do canhoto (spec 228 T4.1)', () => {
  it('título com a nota, ícone da câmera, ator e "Ver no mapa" quando há ponto', () => {
    const dom = renderTimeline([PHOTO_WITH_POINT])

    expect(dom.textContent).toContain('Foto do canhoto — NF-e 123/1')
    expect(dom.textContent).toContain('Marina Alves')
    expect(viewMapButtons(dom)).toHaveLength(1)
  })

  it('sem trip.event-location (location nulo) não há botão nem coordenada', () => {
    const dom = renderTimeline([PHOTO_WITHOUT_PERMISSION])

    expect(dom.textContent).toContain('Foto do canhoto — NF-e 123/1')
    expect(viewMapButtons(dom)).toHaveLength(0)
    expect(dom.textContent).not.toContain('23.55')
    expect(dom.textContent).not.toContain('Latitude')
  })
})

describe('linha do tempo da viagem: endereço corrigido (spec 228 T4.1)', () => {
  it('título, origem, deslocamento, ator e "Ver no mapa" quando há ponto novo', () => {
    const dom = renderTimeline([ADDRESS_WITH_POINT])

    expect(dom.textContent).toContain('Endereço da parada corrigido')
    expect(dom.textContent).toContain('Endereço da parada corrigido')
    expect(dom.textContent).toContain('Marina Alves')
    expect(viewMapButtons(dom)).toHaveLength(1)
  })

  it('origem e deslocamento são uma frase só, num único elemento (M3)', () => {
    const dom = renderTimeline([ADDRESS_WITH_POINT])

    const phrases = [...dom.querySelectorAll('span')].filter((node) =>
      node.textContent?.includes('Corrigido pelo escritório'),
    )
    expect(phrases.map((node) => node.textContent)).toEqual([
      'Corrigido pelo escritório · deslocado 45 m',
    ])
  })

  it('o refino, sem deslocamento, escreve só a origem, sem separador (M3)', () => {
    const dom = renderTimeline([ADDRESS_REFINEMENT])

    const phrase = [...dom.querySelectorAll('span')].find((node) =>
      node.textContent?.includes('Refino de precisão'),
    )
    expect(phrase?.textContent).toBe('Refino de precisão')
  })

  it('o elemento da frase tem classe no CSS module e nenhum estilo inline (M3)', () => {
    const component = readFileSync(
      new URL('../../src/modules/trip/components/TripTimeline.component.tsx', import.meta.url),
      'utf8',
    )
    const styles = readFileSync(
      new URL('../../src/modules/trip/styles/tripTimeline.module.css', import.meta.url),
      'utf8',
    )
    expect(component).toContain('className={styles.itemAddressChange}>{addressChange.summary}')
    expect(styles).toMatch(/\.itemAddressChange\s*\{[^}]*overflow-wrap:\s*anywhere/u)
    expect(component).not.toContain('style={{')
  })

  it('o mapa do endereço diz "novo ponto do endereço", e o da foto continua "onde o motorista tocou" (M1)', () => {
    const dom = renderTimeline([ADDRESS_WITH_POINT, PHOTO_WITH_POINT])

    for (const button of viewMapButtons(dom)) act(() => button.click())
    const captions = [...dom.querySelectorAll('figcaption')].map((node) => node.textContent ?? '')
    expect(captions).toHaveLength(2)
    const addressCaption = captions.find((text) => text.includes('endereço'))
    const photoCaption = captions.find((text) => text.includes('motorista tocou'))
    expect(addressCaption).toContain('Pino liso: novo ponto do endereço da parada')
    expect(addressCaption).not.toContain('motorista tocou')
    expect(photoCaption).not.toContain('endereço')
  })

  it('o refino de precisão não tem ponto: origem sem deslocamento e sem "Ver no mapa"', () => {
    const dom = renderTimeline([ADDRESS_REFINEMENT])

    expect(dom.textContent).toContain('Refino de precisão')
    expect(dom.textContent).not.toContain('deslocado')
    expect(viewMapButtons(dom)).toHaveLength(0)
  })

  it('deslocamento grande sai em quilômetros, como a distância do resto do painel', () => {
    const dom = renderTimeline([ADDRESS_LONG_MOVE])

    expect(dom.textContent).toContain('Corrigido pelo contratante · deslocado 1,5 km')
  })

  it('sem trip.event-location o deslocamento continua e nenhuma coordenada aparece', () => {
    const dom = renderTimeline([{ ...ADDRESS_WITH_POINT, location: null }])

    expect(dom.textContent).toContain('deslocado 45 m')
    expect(viewMapButtons(dom)).toHaveLength(0)
    expect(dom.textContent).not.toContain('Latitude')
  })

  it('em inglês usa as mesmas chaves', async () => {
    await i18n.changeLanguage('en')
    const dom = renderTimeline([ADDRESS_WITH_POINT])

    expect(dom.textContent).toContain('Corrected by the office')
    expect(dom.textContent).toContain('moved 45 m')
    expect(dom.textContent).not.toContain('Corrigido')
  })

  it('o item de outro tipo não ganha origem nem deslocamento', () => {
    const dom = renderTimeline([makeItem('plain', { kind: 'stop.arrived' })])

    expect(dom.textContent).not.toContain('Corrigido pelo')
    expect(dom.textContent).not.toContain('deslocado')
  })
})

describe('Eventos desta entrega: os dois eventos novos (spec 228 T4.1)', () => {
  it('a foto aparece junto da entrega da própria nota, em ordem cronológica', async () => {
    const dom = await renderDocumentEvents([
      PHOTO_WITH_POINT,
      makeItem('delivered', {}),
      ADDRESS_WITH_POINT,
    ])

    const titles = [...dom.querySelectorAll('ol > li p')].map((node) => node.textContent)
    expect(titles[0]).toBe('Endereço da parada corrigido')
    expect(titles[1]).toContain('entregue')
    expect(titles[2]).toBe('Foto do canhoto')
  })

  it('o endereço da parada traz origem e deslocamento; só o evento com ponto abre o mapa', async () => {
    const dom = await renderDocumentEvents([
      ADDRESS_WITH_POINT,
      ADDRESS_REFINEMENT,
      PHOTO_WITHOUT_PERMISSION,
    ])

    expect(dom.textContent).toContain('Corrigido pelo escritório')
    expect(dom.textContent).toContain('Refino de precisão')
    expect(viewMapButtons(dom)).toHaveLength(1)
    expect(entryOf(dom, 'Foto do canhoto').textContent).not.toContain('Ver no mapa')
  })

  it('sem o evento do endereço na resposta, a seção não o mostra', async () => {
    const dom = await renderDocumentEvents([makeItem('delivered', {}), PHOTO_WITH_POINT])

    expect(dom.textContent).toContain('Foto do canhoto')
    expect(dom.textContent).not.toContain('Endereço da parada corrigido')
  })
})
