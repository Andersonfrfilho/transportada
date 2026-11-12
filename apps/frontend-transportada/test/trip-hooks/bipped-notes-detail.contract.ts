/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 298 T3.3, critério 4 (detalhe da viagem): a chave lida entra na lista de notas encontradas e
 * só vira vínculo com "Acrescentar", pela mesma rota de vínculo do detalhe; a recusa da API fica na
 * linha da nota e o resto da viagem segue sendo regra dela.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { BippedNotesOverridesContext } from '../../src/modules/trip/hooks/bippedNotesOverrides.context'
import { CHECK_BATCH_WINDOW_MS } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookup.constant'
import { TripLinkDocumentPanel } from '../../src/modules/trip/components/TripLinkDocumentPanel.component'
import { useTripDocumentLinkForm } from '../../src/modules/trip/hooks/useTripDocumentLinkForm.hook'
import type { ScannedNfeDocument } from '../../src/modules/trip/shared/trip.types'
import {
  createFakeClient,
  createFakeScheduler,
  type FakeClient,
  type FakeScheduler,
} from '../nfe-access-key-lookup/lookup.fixture'

const REGISTERED = '35260712001234560001550010000000011000000018'
const OTHER = '35260712001234560001550010000000021000000023'

function scanned(accessKey: string, id: string): ScannedNfeDocument {
  return {
    accessKey,
    emitterName: 'ZARAGOZA',
    id,
    issuedAt: '2026-07-01T10:00:00.000Z',
    number: id,
    recipientName: 'GOLFETO',
    series: '1',
    status: 'authorized',
    tripId: null,
  } as unknown as ScannedNfeDocument
}

const DOCUMENTS = new Map([
  [REGISTERED, scanned(REGISTERED, 'doc-registered')],
  [OTHER, scanned(OTHER, 'doc-other')],
])

let root: Root | undefined
let container: HTMLElement | undefined
let client: FakeClient
let scheduler: FakeScheduler
let linked: string[]
let refusedIds: Set<string>

function Harness() {
  const linkForm = useTripDocumentLinkForm({
    linkScannedDocument: ({ documentId }) => {
      if (refusedIds.has(documentId))
        return Promise.reject(new Error('TRIP_DOCUMENT_ALREADY_LINKED'))
      linked.push(documentId)
      return Promise.resolve({})
    },
  })
  return createElement(
    BippedNotesOverridesContext.Provider,
    {
      value: {
        findDocument: (accessKey) => Promise.resolve(DOCUMENTS.get(accessKey) ?? null),
        lookup: { client, scheduler },
      },
    },
    createElement(TripLinkDocumentPanel, {
      availableDocuments: [],
      isLinking: false,
      isLoadingDocuments: false,
      linkForm,
      onLinkCandidate: () => undefined,
      onLinkTyped: () => undefined,
      onNeedDocuments: () => undefined,
    }),
  )
}

function mount(): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root?.render(createElement(Harness)))
}

function bip(accessKey: string): void {
  const input = container?.querySelector('input[type="text"]') as HTMLInputElement
  input.value = accessKey
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
    )
  })
}

async function settle(): Promise<void> {
  await act(async () => {
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    await scheduler.advance(3_000)
  })
}

function rows(): HTMLElement[] {
  return [...(container?.querySelectorAll('li[data-state]') ?? [])] as HTMLElement[]
}

function findButton(
  scope: Element | undefined | null,
  label: string,
): HTMLButtonElement | undefined {
  return [...(scope?.querySelectorAll('button') ?? [])].find((button) =>
    (button.textContent ?? '').startsWith(label),
  )
}

beforeEach(() => {
  client = createFakeClient()
  scheduler = createFakeScheduler()
  linked = []
  refusedIds = new Set()
  client.documents.set(REGISTERED, 'doc-registered')
  client.documents.set(OTHER, 'doc-other')
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('notas bipadas no detalhe da viagem', () => {
  it('a chave lida vira linha e só vincula com Acrescentar, saindo da lista depois', async () => {
    mount()
    bip(REGISTERED)
    await settle()

    expect(rows()).toHaveLength(1)
    expect(linked).toEqual([])
    await act(async () => {
      findButton(rows()[0], 'Acrescentar')?.click()
      await Promise.resolve()
    })

    expect(linked).toEqual(['doc-registered'])
    expect(rows()).toHaveLength(0)
  })

  it('"Acrescentar todas as prontas" vincula cada uma pela rota existente', async () => {
    mount()
    bip(REGISTERED)
    bip(OTHER)
    await settle()

    await act(async () => {
      findButton(container, 'Acrescentar todas')?.click()
      await Promise.resolve()
    })

    expect(linked.sort()).toEqual(['doc-other', 'doc-registered'])
  })

  it('a recusa da API fica na linha e a nota segue oferecendo Acrescentar', async () => {
    refusedIds.add('doc-registered')
    mount()
    bip(REGISTERED)
    await settle()
    await act(async () => {
      findButton(rows()[0], 'Acrescentar')?.click()
      await Promise.resolve()
    })

    expect(linked).toEqual([])
    expect(rows()).toHaveLength(1)
    expect(findButton(rows()[0], 'Acrescentar')).toBeDefined()
    expect(container?.textContent).toContain('Esta nota já está vinculada a uma viagem.')
  })
})
