/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T2.3 (RF4): a transferência de tripulação no DOM da linha do tempo — título, autor,
 * "Maria → João" por papel, motivo, diferença de custo e o aviso do MDF-e. Dados sintéticos.
 */
import { readFileSync } from 'node:fs'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import { i18n } from '../../src/modules/shared/i18n/i18n.service'
import { TripTimeline } from '../../src/modules/trip/components/TripTimeline.component'
import type {
  TripTimelineCrewMember,
  TripTimelineCrewTransfer,
  TripTimelineItem,
} from '../../src/modules/trip/shared/trip.types'

let root: Root | undefined
let container: HTMLDivElement | undefined

function member(role: 'driver' | 'helper', name: string, position: number): TripTimelineCrewMember {
  return { driverId: `id-${name}`, name, position, role }
}

const TRANSFER: TripTimelineCrewTransfer = {
  costDifference: '500.00',
  mdfeDriverDivergence: true,
  nextCrew: [member('driver', 'João', 1), member('helper', 'Ana', 2)],
  previousCrew: [member('driver', 'Maria', 1), member('helper', 'Pedro', 2)],
  reason: 'Maria passou mal na estrada',
}

function makeItem(crewTransfer: TripTimelineCrewTransfer): TripTimelineItem {
  return {
    actorName: 'Marina Alves',
    channel: 'backoffice',
    closeReason: null,
    crewTransfer,
    document: null,
    fromStatus: null,
    id: 'crew-1',
    kind: 'crew_transfer',
    location: null,
    locationState: null,
    occurrence: null,
    occurredAt: '2026-10-07T12:00:00.000Z',
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: null,
    toStatus: null,
  }
}

function withoutCost(transfer: TripTimelineCrewTransfer): TripTimelineCrewTransfer {
  const copy: Record<string, unknown> = { ...transfer }
  delete copy['costDifference']
  return copy as TripTimelineCrewTransfer
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
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
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

function phrases(dom: HTMLElement): readonly string[] {
  return [...dom.querySelectorAll('p')].map((node) => node.textContent ?? '')
}

afterEach(async () => {
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  await i18n.changeLanguage('pt-BR')
})

describe('linha do tempo da viagem: tripulação transferida (spec 249 T2.3)', () => {
  it('título, autor e a troca por papel, motorista primeiro', () => {
    const dom = renderTimeline([makeItem(TRANSFER)])

    expect(phrases(dom)).toContain('Tripulação transferida')
    expect(dom.textContent).toContain('Marina Alves')
    expect(phrases(dom)).toContain('Motorista: Maria → João')
    expect(phrases(dom)).toContain('Ajudante: Pedro → Ana')
  })

  it('o motivo, a diferença de custo com sinal e o aviso do MDF-e autorizado', () => {
    const dom = renderTimeline([makeItem(TRANSFER)])

    expect(phrases(dom)).toContain('Motivo: Maria passou mal na estrada')
    expect(phrases(dom)).toContain('Diferença de custo: +R$ 500,00')
    expect(phrases(dom).some((text) => text.includes('MDF-e autorizado'))).toBe(true)
  })

  it('diferença negativa mantém o sinal', () => {
    const dom = renderTimeline([makeItem({ ...TRANSFER, costDifference: '-540.00' })])

    expect(phrases(dom)).toContain('Diferença de custo: -R$ 540,00')
  })

  it('sem costDifference (sem trip.financials) a linha de custo não existe', () => {
    const dom = renderTimeline([makeItem(withoutCost(TRANSFER))])

    expect(dom.textContent).not.toContain('Diferença de custo')
    expect(dom.textContent).not.toContain('R$')
    expect(phrases(dom)).toContain('Motorista: Maria → João')
  })

  it('sem divergência o aviso do MDF-e não aparece', () => {
    const dom = renderTimeline([makeItem({ ...TRANSFER, mdfeDriverDivergence: false })])

    expect(dom.textContent).not.toContain('MDF-e')
  })

  it('em inglês, os mesmos fatos com o texto do outro idioma', async () => {
    await i18n.changeLanguage('en')
    const dom = renderTimeline([makeItem(TRANSFER)])

    expect(phrases(dom)).toContain('Crew transferred')
    expect(phrases(dom)).toContain('Driver: Maria → João')
    expect(phrases(dom)).toContain('Helper: Pedro → Ana')
    expect(dom.textContent).toContain('Reason: Maria passou mal na estrada')
  })

  it('o resumo usa classes do CSS module e nenhum estilo inline', () => {
    const component = readFileSync(
      new URL(
        '../../src/modules/trip/components/TripTimelineCrewTransfer.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(component).not.toContain('style={{')
    expect(component).toContain('className=')
  })
})
