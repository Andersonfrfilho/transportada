/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196: o evento cuja posição o aparelho não entregou aparecia como um pino vermelho e nada
 * mais — zero caractere visível. A explicação morava inteira no `Tooltip` e no `aria-label`, e
 * tooltip não abre no dedo: num celular, o estado de alarme da linha do tempo era um glifo colorido
 * que o leitor tinha de adivinhar.
 *
 * A saída escolhida é a mais barata e a que não depende de gesto nenhum: **só o tom `problem`
 * ganha o rótulo curto visível ao lado do ícone**. Os outros quatro casos seguem mudos de
 * propósito — "posição registrada" é o normal, e repeti-lo em cada evento encheria a lista de
 * ruído para dizer que nada aconteceu. A camada continua carregando a frase longa, para quem
 * aponta ou foca.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripTimeline } from '../../src/modules/trip/components/TripTimeline.component'
import type { TripTimelineItem } from '../../src/modules/trip/shared/trip.types'

const STYLES_PATH = new URL(
  '../../src/modules/trip/styles/tripTimeline.module.css',
  import.meta.url,
)

const styles = await Bun.file(STYLES_PATH).text()

let root: Root | undefined
let container: HTMLDivElement | undefined

function makeItem(
  id: string,
  locationState: NonNullable<TripTimelineItem['locationState']>,
): TripTimelineItem {
  return {
    actorName: 'Marina Alves',
    channel: 'driver_app',
    closeReason: null,
    document: null,
    fromStatus: null,
    id,
    kind: 'stop.arrived',
    location: null,
    locationState,
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

function locationButton(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('button[data-tone]')
  if (button === null) throw new Error('botão de posição ausente')
  return button
}

afterEach(() => {
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('posição que o aparelho não entregou (spec 196)', () => {
  it('diz em palavras, na tela, que a posição não veio', () => {
    const host = renderTimeline([makeItem('sem-posicao', 'unavailable')])
    const button = locationButton(host)

    expect(button.dataset.tone).toBe('problem')
    expect(button.textContent?.trim()).toBe('Posição indisponível')
  })

  /** Label in Name: o nome acessível começa pelo texto que está na tela. */
  it('e o nome acessível continua começando pelo mesmo texto visível', () => {
    const host = renderTimeline([makeItem('sem-posicao', 'unavailable')])
    const name = locationButton(host).getAttribute('aria-label') ?? ''

    expect(name.startsWith('Posição indisponível')).toBe(true)
    expect(name).toContain('O aparelho não entregou a posição neste toque.')
  })

  /**
   * `captured` sem coordenada é o leitor sem `trip.event-location` — o GPS funcionou, e o tom é
   * neutro. Nada de alarme para mostrar, então nada de palavra: dez eventos repetindo "posição
   * registrada" seria ruído para dizer que o normal aconteceu.
   */
  it('o evento sem alarme segue mudo, e a lista não ganha ruído', () => {
    const host = renderTimeline([makeItem('sem-alarme', 'captured')])
    const button = locationButton(host)

    expect(button.dataset.tone).not.toBe('problem')
    expect(button.textContent?.trim()).toBe('')
  })

  /**
   * O alvo de 44px do pino era um quadrado centrado — forma certa para um ícone, errada para um
   * botão que agora carrega uma frase: centrado no meio do texto, ele deixaria o próprio ícone com
   * a altura da linha.
   */
  it('e o alvo de toque acompanha a largura do rótulo, em vez de ficar quadrado no meio da frase', () => {
    const start = styles.indexOf('.locationProblem::after {')
    expect(start === -1).toBe(false)
    const rule = styles.slice(start, styles.indexOf('}', start))

    expect(rule).toContain('inline-size: 100%')
  })
})
