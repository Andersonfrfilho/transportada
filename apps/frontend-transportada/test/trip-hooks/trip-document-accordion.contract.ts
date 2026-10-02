/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 227 T1.1 (RF1/RF2/RF9, CA01): a nota é um acordeão de abertura exclusiva. Prova pela
 * **estrutura renderizada** — a caixa de seleção e o botão de abrir são irmãos (botão dentro de
 * botão é HTML inválido e engole o clique), só uma nota abre por vez, e seguir a âncora da linha do
 * tempo abre a nota. Dados sintéticos.
 */
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import {
  TripStopDocumentGroup,
  type TripStopDocumentActions,
} from '../../src/modules/trip/components/TripStopList.component'
import { useOpenTripDocument } from '../../src/modules/trip/hooks/useOpenTripDocument.hook'
import { TRIP_READ_PERMISSION } from '../../src/modules/trip/shared/trip.constant'
import type { TripDocumentDetail } from '../../src/modules/trip/shared/trip.types'
import { resolveTripTimelineDocumentHref } from '../../src/modules/trip/shared/tripTimelineLink.service'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderHook, waitFor } from './renderHook.helper'

const { useTripWorkspace } = await import('@/modules/trip/hooks/useTripWorkspace.hook')

let root: Root | undefined
let container: HTMLDivElement | undefined

function makeDocument(id: string, overrides: Partial<TripDocumentDetail> = {}): TripDocumentDetail {
  return {
    cteAuthorized: false,
    deliveredAt: null,
    fiscalStatus: 'authorized',
    id,
    nfeNumber: id.toUpperCase(),
    nfeSeries: '1',
    returnedAt: null,
    separationStatus: 'pending',
    ...overrides,
  } as unknown as TripDocumentDetail
}

function makeActions(overrides: Partial<TripStopDocumentActions>): TripStopDocumentActions {
  return {
    canFieldDelivery: () => false,
    canFieldOccurrence: () => false,
    canManage: false,
    canSeparationOccurrence: false,
    capabilities: { canDocument: () => false, canStop: () => false, canTrip: () => false },
    fiscalReadinessByDocumentId: new Map(),
    renderProof: (documentId: string) =>
      createElement('section', { 'data-part': 'proof' }, `comprovante ${documentId}`),
    renderOccurrences: (documentId: string) =>
      createElement('section', { 'data-part': 'occurrences' }, `ocorrencias ${documentId}`),
    ...overrides,
  } as unknown as TripStopDocumentActions
}

type Harness = Readonly<{ selected: string[]; toggled: string[] }>

function Accordion({ harness }: Readonly<{ harness: Harness }>): ReactElement {
  const { openDocumentId, toggleDocument } = useOpenTripDocument()
  const documents = [makeDocument('doc-a'), makeDocument('doc-b', { deliveredAt: '2026-10-01' })]
  const actions = makeActions({
    onToggleDocument: (documentId: string) => {
      harness.toggled.push(documentId)
      toggleDocument(documentId)
    },
    openDocumentId,
  })
  const selection = {
    clear: () => undefined,
    replace: () => undefined,
    selectedIds: new Set<string>(),
    toggle: (documentId: string) => void harness.selected.push(documentId),
    toggleMany: () => undefined,
  }

  return createElement(
    'div',
    null,
    createElement('a', { href: resolveTripTimelineDocumentHref('doc-b'), id: 'link-b' }, 'ir'),
    createElement(TripStopDocumentGroup, { actions, documents, selection }),
  )
}

function renderAccordion(): { dom: HTMLElement; harness: Harness } {
  const harness: Harness = { selected: [], toggled: [] }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root?.render(createElement(Accordion, { harness })))
  return { dom: container, harness }
}

function toggleOf(dom: HTMLElement, documentId: string): HTMLButtonElement {
  const button = dom.querySelector<HTMLButtonElement>(
    `#trip-timeline-document-${documentId} button[aria-expanded]`,
  )
  if (button === null) throw new Error(`TOGGLE_NOT_FOUND:${documentId}`)
  return button
}

function checkboxOf(dom: HTMLElement, documentId: string): HTMLInputElement {
  const input = dom.querySelector<HTMLInputElement>(
    `#trip-timeline-document-${documentId} input[type="checkbox"]`,
  )
  if (input === null) throw new Error(`CHECKBOX_NOT_FOUND:${documentId}`)
  return input
}

function isOpen(dom: HTMLElement, documentId: string): boolean {
  return toggleOf(dom, documentId).getAttribute('aria-expanded') === 'true'
}

afterEach(() => {
  window.location.hash = ''
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('a nota é um acordeão de abertura exclusiva (spec 227 RF1/CA01)', () => {
  it('nasce toda fechada, e cada cabeçalho tem um botão com aria-expanded', () => {
    const { dom } = renderAccordion()

    expect(isOpen(dom, 'doc-a')).toBe(false)
    expect(isOpen(dom, 'doc-b')).toBe(false)
    expect(toggleOf(dom, 'doc-a').getAttribute('aria-controls')).toBeString()
  })

  it('abrir uma nota fecha a que estava aberta', () => {
    const { dom } = renderAccordion()

    act(() => toggleOf(dom, 'doc-a').click())
    expect(isOpen(dom, 'doc-a')).toBe(true)
    expect(isOpen(dom, 'doc-b')).toBe(false)

    act(() => toggleOf(dom, 'doc-b').click())
    expect(isOpen(dom, 'doc-a')).toBe(false)
    expect(isOpen(dom, 'doc-b')).toBe(true)
    expect(dom.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1)
  })

  it('clicar na nota aberta a fecha', () => {
    const { dom } = renderAccordion()

    act(() => toggleOf(dom, 'doc-a').click())
    act(() => toggleOf(dom, 'doc-a').click())

    expect(isOpen(dom, 'doc-a')).toBe(false)
  })

  it('o comprovante só aparece na nota entregue, e só com ela aberta', () => {
    const { dom } = renderAccordion()

    act(() => toggleOf(dom, 'doc-a').click())
    expect(dom.textContent).not.toInclude('comprovante doc-a')

    act(() => toggleOf(dom, 'doc-b').click())
    expect(dom.textContent).toInclude('comprovante doc-b')
  })
})

describe('a seção Ocorrências é irmã do comprovante, depois dele (spec 227 D2/RF2)', () => {
  function bodyOf(dom: HTMLElement, documentId: string): HTMLElement {
    const body = toggleOf(dom, documentId)
      .closest('li')
      ?.querySelector<HTMLElement>('[id^="trip-stop-document-body-"]')
    if (body === null || body === undefined) throw new Error(`BODY_NOT_FOUND:${documentId}`)
    return body
  }

  it('na nota entregue aberta, o comprovante vem antes das ocorrências, como irmãos', () => {
    const { dom } = renderAccordion()
    act(() => toggleOf(dom, 'doc-b').click())

    const parts = Array.from(bodyOf(dom, 'doc-b').children).map((child) =>
      child.getAttribute('data-part'),
    )
    const proof = dom.querySelector('[data-part="proof"]')
    const occurrences = dom.querySelector('[data-part="occurrences"]')

    expect(parts.indexOf('proof')).toBeGreaterThanOrEqual(0)
    expect(parts.indexOf('occurrences')).toBeGreaterThan(parts.indexOf('proof'))
    expect(proof?.contains(occurrences ?? proof)).toBe(false)
  })

  it('a nota não entregue aberta mostra as ocorrências mesmo sem comprovante', () => {
    const { dom } = renderAccordion()
    act(() => toggleOf(dom, 'doc-a').click())

    expect(dom.querySelector('[data-part="proof"]')).toBeNull()
    expect(dom.querySelector('[data-part="occurrences"]')).not.toBeNull()
  })

  it('a nota fechada não mostra seção nenhuma', () => {
    const { dom } = renderAccordion()

    expect(dom.querySelector('[data-part="occurrences"]')).toBeNull()
  })
})

describe('a caixa de seleção e o botão de abrir são irmãos (spec 227 RF1)', () => {
  it('a caixa não está dentro do botão, e o botão não está dentro da caixa', () => {
    const { dom } = renderAccordion()

    for (const documentId of ['doc-a', 'doc-b']) {
      const checkbox = checkboxOf(dom, documentId)
      const button = toggleOf(dom, documentId)

      expect(checkbox.closest('button')).toBeNull()
      expect(button.querySelector('input')).toBeNull()
      expect(button.contains(checkbox)).toBe(false)
    }
  })

  it('nenhum botão contém outro botão no cabeçalho da nota', () => {
    const { dom } = renderAccordion()

    expect(dom.querySelectorAll('button button')).toHaveLength(0)
  })

  it('marcar a caixa seleciona a nota e não abre nem fecha nada', () => {
    const { dom, harness } = renderAccordion()

    act(() => checkboxOf(dom, 'doc-a').click())
    expect(harness.selected).toEqual(['doc-a'])
    expect(harness.toggled).toEqual([])
    expect(isOpen(dom, 'doc-a')).toBe(false)

    act(() => toggleOf(dom, 'doc-a').click())
    act(() => checkboxOf(dom, 'doc-a').click())
    expect(isOpen(dom, 'doc-a')).toBe(true)
  })

  it('abrir a nota não marca a caixa', () => {
    const { dom, harness } = renderAccordion()

    act(() => toggleOf(dom, 'doc-b').click())

    expect(harness.selected).toEqual([])
  })
})

describe('seguir a âncora da linha do tempo abre a nota (spec 227 RF9)', () => {
  it('o clique no link do evento abre a nota apontada, e fecha a anterior', () => {
    const { dom } = renderAccordion()
    act(() => toggleOf(dom, 'doc-a').click())

    act(() => dom.querySelector<HTMLAnchorElement>('#link-b')?.click())

    expect(isOpen(dom, 'doc-b')).toBe(true)
    expect(isOpen(dom, 'doc-a')).toBe(false)
  })

  it('o clique repetido no mesmo link reabre a nota que o operador fechou', () => {
    const { dom } = renderAccordion()
    const link = dom.querySelector<HTMLAnchorElement>('#link-b')

    act(() => link?.click())
    act(() => toggleOf(dom, 'doc-b').click())
    expect(isOpen(dom, 'doc-b')).toBe(false)

    act(() => link?.click())
    expect(isOpen(dom, 'doc-b')).toBe(true)
  })

  it('o endereço com a âncora (volta, link colado) também abre a nota', () => {
    const { dom } = renderAccordion()

    act(() => {
      window.location.hash = resolveTripTimelineDocumentHref('doc-a')
      window.dispatchEvent(new window.Event('hashchange'))
    })

    expect(isOpen(dom, 'doc-a')).toBe(true)
  })
})

describe('abrir a nota não pede comprovante que não existe (spec 227 D1)', () => {
  const TRIP = {
    documents: [
      makeDocument('doc-a'),
      makeDocument('doc-b', { deliveredAt: '2026-10-01T10:00:00Z' }),
    ],
    id: 'trip-1',
    stops: [],
  }

  async function renderWorkspaceWithCounter() {
    resetTripHookFakes([])
    const proofCalls: string[] = []
    const occurrenceCalls: string[] = []
    fakes.tripClient = {
      ...fakes.tripClient,
      getTrip: () => Promise.resolve(TRIP),
      readDeliveryProofs: (input: { documentId: string }) => {
        proofCalls.push(input.documentId)
        return Promise.resolve([])
      },
      readTripDocumentProducts: () => Promise.resolve([]),
      readTripOccurrences: (input: { documentId: string }) => {
        occurrenceCalls.push(input.documentId)
        return Promise.resolve([])
      },
    } as unknown as typeof fakes.tripClient
    const rendered = await renderHook(() =>
      useTripWorkspace({
        companyId: 'company-1',
        permissions: [TRIP_READ_PERMISSION],
        tripId: 'trip-1',
      }),
    )
    await waitFor(() => expect(rendered.result().trip).toBeDefined())
    return { occurrenceCalls, proofCalls, rendered }
  }

  it('a nota não entregue abre sem buscar comprovante nem itens, mas busca as ocorrências', async () => {
    const { occurrenceCalls, proofCalls, rendered } = await renderWorkspaceWithCounter()

    act(() => rendered.result().toggleDocument('doc-a'))
    await waitFor(() => expect(occurrenceCalls).toEqual(['doc-a']))
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(rendered.result().openDocumentId).toBe('doc-a')
    expect(rendered.result().openProofDocumentId).toBeNull()
    expect(proofCalls).toEqual([])
    expect(occurrenceCalls).toEqual(['doc-a'])
    rendered.unmount()
  })

  it('a nota entregue busca o comprovante e as ocorrências, uma vez cada', async () => {
    const { occurrenceCalls, proofCalls, rendered } = await renderWorkspaceWithCounter()

    act(() => rendered.result().toggleDocument('doc-b'))
    await waitFor(() => expect(proofCalls).toEqual(['doc-b']))
    await waitFor(() => expect(occurrenceCalls).toEqual(['doc-b']))

    expect(rendered.result().openProofDocumentId).toBe('doc-b')
    rendered.unmount()
  })

  it('a nota fechada não busca nada', async () => {
    const { occurrenceCalls, proofCalls, rendered } = await renderWorkspaceWithCounter()
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(proofCalls).toEqual([])
    expect(occurrenceCalls).toEqual([])
    rendered.unmount()
  })
})
