/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196: a camada do pino de GPS no DOM. Duas coisas, e as duas são de acessibilidade: ela abre
 * no **foco de teclado** (não só sob o ponteiro — dica que só existe para quem tem mouse é
 * informação que some), e o que ela diz é a distância na unidade legível, não metro cru. Coordenada
 * sintética.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripTimeline } from '../../src/modules/trip/components/TripTimeline.component'
import type { TripTimelineItem } from '../../src/modules/trip/shared/trip.types'

let root: Root | undefined
let container: HTMLDivElement | undefined
let originalBoundingRect: PropertyDescriptor | undefined

/**
 * ⚠️ Sem retângulo, a camada fecha no mesmo quadro em que abre. `useFloatingLayer` mede o gatilho e
 * chama `onDismiss` quando ele está fora da janela — e no DOM de teste `getBoundingClientRect`
 * devolve tudo zerado, o que para a conta de visibilidade é "fora da tela". Não é defeito do
 * produto: é a medição que o navegador faz e o DOM de teste não.
 */
const ANCHOR_RECT = {
  bottom: 120,
  height: 20,
  left: 40,
  right: 60,
  top: 100,
  width: 20,
  x: 40,
  y: 100,
}

const FAR_READING = {
  accuracyMeters: 12.4,
  capturedAt: '2026-09-18T12:00:00',
  distanceMeters: 208255,
  latitude: -23.55,
  longitude: -46.63,
}

const NEAR_READING = { ...FAR_READING, distanceMeters: 850 }

function makeLocatedItem(location: typeof FAR_READING): TripTimelineItem {
  return {
    actorName: 'Marina Alves',
    channel: 'driver_app',
    closeReason: null,
    document: null,
    fromStatus: null,
    id: 'item-located',
    kind: 'stop.arrived',
    location,
    locationState: 'captured',
    occurrence: null,
    occurredAt: '2026-09-18T12:00:00',
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: { id: 'stop-5', sequence: 5 },
    toStatus: null,
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
        createElement(TripTimeline, { openDocumentId: null, query, stops: [] }),
      ),
    )
  })
  return container
}

function findLocationPin(host: HTMLElement): HTMLButtonElement {
  const pin = [...host.querySelectorAll('button')].find((candidate) =>
    (candidate.getAttribute('aria-label') ?? '').startsWith('Posição registrada'),
  )
  if (pin === undefined) throw new Error('pino de posição ausente')
  return pin
}

/** O foco de teclado chega como `focusin`; é ele que o `Tooltip` escuta. */
function focusByKeyboard(pin: HTMLButtonElement): void {
  act(() => {
    pin.focus()
    pin.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  })
}

/**
 * ⚠️ Fechar é parte do teste, não da limpeza. Desmontar a raiz com o portal da camada ainda aberto
 * estoura `removeChild` no DOM de teste, e fechar no `afterEach` estoura igual — só dentro do corpo
 * do teste o React fecha o portal em paz.
 */
function blurPin(pin: HTMLButtonElement): void {
  act(() => {
    pin.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

function readTooltipLayerText(host: HTMLElement): string {
  const describedBy = pinWrapper(host).getAttribute('aria-describedby')
  if (describedBy === null) return ''
  return document.getElementById(describedBy)?.textContent ?? ''
}

function pinWrapper(host: HTMLElement): HTMLElement {
  const parent = findLocationPin(host).parentElement
  if (parent === null) throw new Error('invólucro do pino ausente')
  return parent
}

beforeEach(() => {
  originalBoundingRect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect')
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: function stubbedRect(): DOMRect {
      return { ...ANCHOR_RECT, toJSON: () => ANCHOR_RECT }
    },
    writable: true,
  })
})

afterEach(() => {
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  if (originalBoundingRect !== undefined) {
    Object.defineProperty(Element.prototype, 'getBoundingClientRect', originalBoundingRect)
  }
})

describe('camada do pino de GPS (spec 196)', () => {
  it('fechada até alguém chegar nela', () => {
    const host = renderTimeline([makeLocatedItem(FAR_READING)])

    expect(pinWrapper(host).getAttribute('aria-describedby')).toBeNull()
  })

  it('abre no foco de teclado, e descreve o pino pelo id da camada', () => {
    const host = renderTimeline([makeLocatedItem(FAR_READING)])
    focusByKeyboard(findLocationPin(host))

    const describedBy = pinWrapper(host).getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    expect(document.getElementById(describedBy ?? '')).not.toBeNull()
    blurPin(findLocationPin(host))
  })

  it('fecha ao sair do foco — a camada não fica pendurada na tela', () => {
    const host = renderTimeline([makeLocatedItem(FAR_READING)])
    const pin = findLocationPin(host)
    focusByKeyboard(pin)
    blurPin(pin)

    expect(pinWrapper(host).getAttribute('aria-describedby')).toBeNull()
  })

  it('a 208 km não sai em metro cru, nem na camada nem no nome acessível', () => {
    const host = renderTimeline([makeLocatedItem(FAR_READING)])
    focusByKeyboard(findLocationPin(host))

    expect(readTooltipLayerText(host)).toContain('208 km')
    expect(readTooltipLayerText(host)).not.toContain('208255')
    expect(findLocationPin(host).getAttribute('aria-label')).toContain('208 km')
    blurPin(findLocationPin(host))
  })

  it('abaixo de um quilômetro continua em metro', () => {
    const host = renderTimeline([makeLocatedItem(NEAR_READING)])
    focusByKeyboard(findLocationPin(host))

    expect(readTooltipLayerText(host)).toContain('850 m')
    blurPin(findLocationPin(host))
  })
})
