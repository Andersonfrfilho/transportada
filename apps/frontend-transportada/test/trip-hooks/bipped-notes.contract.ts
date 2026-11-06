/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 298 T3.2, critério 4: bipar uma nota cadastrada, uma desconhecida que é importada e uma
 * recusada produz três linhas em "Notas encontradas"; nenhuma entra na viagem sem "Acrescentar", e
 * "Acrescentar todas as prontas" leva só as que podem entrar.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { BippedNotesOverridesContext } from '../../src/modules/trip/hooks/bippedNotesOverrides.context'
import { TripNoteIntake } from '../../src/modules/trip/components/TripNoteIntake.component'
import { CHECK_BATCH_WINDOW_MS } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookup.constant'
import type { ScannedNfeDocument } from '../../src/modules/trip/shared/trip.types'
import {
  createFakeClient,
  createFakeScheduler,
  view,
  type FakeClient,
  type FakeScheduler,
} from '../nfe-access-key-lookup/lookup.fixture'

const REGISTERED = '35260712001234560001550010000000011000000018'
const UNKNOWN = '35260712001234560001550010000000021000000023'
const REFUSED = '35260712001234560001550010000000031000000039'
const ON_TRIP = '35260712001234560001550010000000041000000044'

function scanned(accessKey: string, id: string, tripId: null | string = null): ScannedNfeDocument {
  return {
    accessKey,
    emitterName: 'ZARAGOZA',
    id,
    issuedAt: '2026-07-01T10:00:00.000Z',
    number: id,
    recipientName: 'GOLFETO',
    series: '1',
    status: 'authorized',
    tripId,
  } as unknown as ScannedNfeDocument
}

const DOCUMENTS = new Map([
  [REGISTERED, scanned(REGISTERED, 'doc-registered')],
  [UNKNOWN, scanned(UNKNOWN, 'doc-unknown')],
  [ON_TRIP, scanned(ON_TRIP, 'doc-on-trip', 'trip-9')],
])

let root: Root | undefined
let container: HTMLElement | undefined
let client: FakeClient
let scheduler: FakeScheduler
let staged: ScannedNfeDocument[]

function mount(): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      createElement(
        BippedNotesOverridesContext.Provider,
        {
          value: {
            findDocument: (accessKey) => Promise.resolve(DOCUMENTS.get(accessKey) ?? null),
            lookup: { client, scheduler },
          },
        },
        createElement(TripNoteIntake, {
          documents: [],
          isLoading: false,
          onFilteredChange: () => undefined,
          onStage: (documents) => {
            staged.push(...documents)
          },
          stagedDocumentIds: staged.map((document) => document.id),
        }),
      ),
    )
  })
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

async function settleLookups(): Promise<void> {
  await act(async () => {
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    await scheduler.advance(3_000)
  })
}

function rows(): HTMLElement[] {
  return [...(container?.querySelectorAll('li[data-state]') ?? [])] as HTMLElement[]
}

function buttonLabels(element: Element): string[] {
  return [...element.querySelectorAll('button')].map((button) => button.textContent ?? '')
}

beforeEach(() => {
  client = createFakeClient()
  scheduler = createFakeScheduler()
  staged = []
  client.documents.set(REGISTERED, 'doc-registered')
  client.documents.set(ON_TRIP, 'doc-on-trip')
  client.requestResponses.set(UNKNOWN, () =>
    Promise.resolve({ kind: 'lookup', lookup: view({ id: 'lookup-unknown', status: 'queued' }) }),
  )
  client.getResponses.set('lookup-unknown', () =>
    Promise.resolve(view({ documentId: 'doc-unknown', id: 'lookup-unknown', status: 'imported' })),
  )
  client.requestResponses.set(REFUSED, () =>
    Promise.resolve({
      kind: 'lookup',
      lookup: view({ id: 'lookup-refused', reason: 'not_found', status: 'refused' }),
    }),
  )
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('notas bipadas na criação da viagem', () => {
  it('cadastrada, desconhecida importada e recusada viram três linhas e nenhuma entra sozinha', async () => {
    mount()
    bip(REGISTERED)
    bip(UNKNOWN)
    bip(REFUSED)
    await settleLookups()

    expect(rows()).toHaveLength(3)
    expect(container?.textContent).toContain('Notas encontradas')
    expect(container?.textContent).toContain('Bipada')
    expect(buttonLabels(rows()[0] as Element)).toContain('Acrescentar')
    expect(buttonLabels(rows()[1] as Element)).toContain('Acrescentar')
    expect(buttonLabels(rows()[2] as Element)).not.toContain('Acrescentar')
    expect(container?.querySelector('input[type="file"]')).not.toBeNull()
    expect(staged).toEqual([])
  })

  it('"Acrescentar todas as prontas" leva só as prontas, sem a recusada e sem a que está em outra viagem', async () => {
    mount()
    bip(REGISTERED)
    bip(UNKNOWN)
    bip(REFUSED)
    bip(ON_TRIP)
    await settleLookups()

    const addAll = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
      (button.textContent ?? '').startsWith('Acrescentar todas'),
    )
    expect(addAll?.textContent).toContain('(2)')
    act(() => addAll?.click())

    expect(staged.map((document) => document.id).sort()).toEqual(['doc-registered', 'doc-unknown'])
  })

  it('nota em outra viagem mostra o aviso e não oferece Acrescentar', async () => {
    mount()
    bip(ON_TRIP)
    await settleLookups()

    const [row] = rows()
    expect(row?.textContent).toContain('Já está em outra viagem')
    expect(buttonLabels(row as Element)).not.toContain('Acrescentar')
  })

  it('Acrescentar usa o mesmo caminho da busca e devolve o foco ao leitor', async () => {
    mount()
    bip(REGISTERED)
    await settleLookups()

    const add = [...(rows()[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Acrescentar',
    )
    act(() => add?.click())

    expect(staged.map((document) => document.id)).toEqual(['doc-registered'])
    const reader = container?.querySelector('input[type="text"]')
    expect(container?.ownerDocument.activeElement === reader).toBe(true)
  })
})
