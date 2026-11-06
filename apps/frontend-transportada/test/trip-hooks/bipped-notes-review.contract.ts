/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 298, correções da revisão da Fase 3: avisos sob o leitor (M2), número de nota lido sem chave
 * (M5, criação e detalhe), corte da busca (M1), acessibilidade (L2) e câmera aberta entre leituras (H2).
 */
import { readFileSync } from 'node:fs'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { CHECK_BATCH_WINDOW_MS } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookup.constant'
import type { AccessKeyLookupRow } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookupRow.service'
import type { NfeDocumentListItem } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import { TripLinkDocumentPanel } from '../../src/modules/trip/components/TripLinkDocumentPanel.component'
import { TripNoteIntake } from '../../src/modules/trip/components/TripNoteIntake.component'
import { BippedNotesOverridesContext } from '../../src/modules/trip/hooks/bippedNotesOverrides.context'
import { useTripDocumentLinkForm } from '../../src/modules/trip/hooks/useTripDocumentLinkForm.hook'
import { excludeBippedDocuments } from '../../src/modules/trip/shared/bippedNote.service'
import type { ScannedNfeDocument } from '../../src/modules/trip/shared/trip.types'
import {
  createFakeClient,
  createFakeScheduler,
  view,
  type FakeClient,
  type FakeScheduler,
} from '../nfe-access-key-lookup/lookup.fixture'

const REGISTERED = '35260712001234560001550010000000011000000018'
const TWIN_A = '35260712001234560001550010000012071000000011'
const TWIN_B = '35260712001234560001550010000012071000000022'
const SOLO = '35260712001234560001550010000482141000000033'

const NULL_FIELDS = [
  'cargoGrossWeight',
  'cargoWeightSource',
  'cteBlockReason',
  'emitterAddress',
  'emitterCity',
  'emitterCityCode',
  'emitterState',
  'emitterTaxId',
  'freightRuleName',
  'nfseBlockReason',
  'nfseInvoiceId',
  'nfseInvoiceNumber',
  'recipientAddress',
  'recipientAddressNumber',
  'recipientCity',
  'recipientCityCode',
  'recipientLatitude',
  'recipientLocationPrecision',
  'recipientLongitude',
  'recipientPhone',
  'recipientPostalCode',
  'recipientState',
  'recipientTaxId',
] as const

function note(accessKey: string, id: string, number: string): NfeDocumentListItem {
  return {
    ...Object.fromEntries(NULL_FIELDS.map((field) => [field, null])),
    accessKey,
    emitterName: 'ZARAGOZA',
    id,
    issuedAt: '2026-07-01T10:00:00.000Z',
    number,
    recipientName: 'GOLFETO',
    series: '1',
    status: 'authorized',
    totalAmount: '100.00',
    tripId: null,
  } as unknown as NfeDocumentListItem
}

function scanned(accessKey: string, id: string): ScannedNfeDocument {
  return { ...note(accessKey, id, id), status: 'authorized', tripId: null } as never
}

const FREE_NOTES = [
  note(SOLO, 'doc-solo', '48214'),
  note(TWIN_A, 'doc-twin-a', '1207'),
  note(TWIN_B, 'doc-twin-b', '1207'),
]
const DOCUMENTS = new Map(
  [REGISTERED, SOLO, TWIN_A, TWIN_B].map((accessKey) => [
    accessKey,
    scanned(accessKey, `doc-${accessKey.slice(-4)}`),
  ]),
)
DOCUMENTS.set(SOLO, scanned(SOLO, 'doc-solo'))
DOCUMENTS.set(TWIN_A, scanned(TWIN_A, 'doc-twin-a'))
DOCUMENTS.set(TWIN_B, scanned(TWIN_B, 'doc-twin-b'))

let root: Root | undefined
let container: HTMLElement | undefined
let client: FakeClient
let scheduler: FakeScheduler
let staged: ScannedNfeDocument[]

function overrides() {
  return {
    findDocument: (accessKey: string) => Promise.resolve(DOCUMENTS.get(accessKey) ?? null),
    lookup: { client, scheduler },
  }
}

function mountIntake(props: { isLoading?: boolean } = {}): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      createElement(
        BippedNotesOverridesContext.Provider,
        { value: overrides() },
        createElement(TripNoteIntake, {
          documents: FREE_NOTES,
          isLoading: props.isLoading ?? false,
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

function Detail() {
  const linkForm = useTripDocumentLinkForm({ linkScannedDocument: () => Promise.resolve({}) })
  return createElement(
    BippedNotesOverridesContext.Provider,
    { value: overrides() },
    createElement(TripLinkDocumentPanel, {
      availableDocuments: FREE_NOTES,
      isLinking: false,
      isLoadingDocuments: false,
      linkForm,
      onLinkCandidate: () => undefined,
      onLinkTyped: () => undefined,
      onNeedDocuments: () => undefined,
    }),
  )
}

function mountDetail(): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root?.render(createElement(Detail)))
}

function bip(text: string): void {
  const input = container?.querySelector('input[type="text"]') as HTMLInputElement
  input.value = text
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

function statusTexts(): string[] {
  return [...(container?.querySelectorAll('[role="status"]') ?? [])].map(
    (element) => element.textContent ?? '',
  )
}

function findButton(scope: Element | null | undefined, label: string) {
  return [...(scope?.querySelectorAll('button') ?? [])].find((button) =>
    (button.textContent ?? '').startsWith(label),
  )
}

beforeEach(() => {
  client = createFakeClient()
  scheduler = createFakeScheduler()
  staged = []
  for (const [accessKey, document] of DOCUMENTS) client.documents.set(accessKey, document.id)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('aviso sob o leitor (M2)', () => {
  it('chave repetida diz que já foi bipada', async () => {
    mountIntake()
    bip(REGISTERED)
    await settle()
    bip(REGISTERED)

    expect(statusTexts()).toContain('Esta chave já foi bipada.')
    expect(rows()).toHaveLength(1)
  })

  it('nota que já está na viagem avisa em vez de sumir calada', async () => {
    staged = [DOCUMENTS.get(REGISTERED) as ScannedNfeDocument]
    mountIntake()
    bip(REGISTERED)
    await settle()

    expect(rows()).toHaveLength(0)
    expect(statusTexts()).toContain('Esta nota já está na viagem.')
  })
})

describe('número de nota lido sem chave (M5)', () => {
  for (const [name, mount] of [
    ['criação', () => mountIntake()],
    ['detalhe', () => mountDetail()],
  ] as const) {
    it(`${name}: um número com uma nota livre vira linha com Acrescentar, sem entrar sozinho`, async () => {
      mount()
      bip('48214')
      await settle()

      expect(rows()).toHaveLength(1)
      expect(findButton(rows()[0], 'Acrescentar')).toBeDefined()
      expect(staged).toEqual([])
    })

    it(`${name}: número repetido pede escolha e só a escolhida vira linha`, async () => {
      mount()
      bip('1207')
      await settle()
      expect(rows()).toHaveLength(0)
      expect(container?.textContent).toContain('Há 2 notas livres com este número')

      const pick = findButton(container?.querySelector('[role="group"]'), 'Nota 1207/1')
      act(() => pick?.click())
      await settle()

      expect(rows()).toHaveLength(1)
      expect(container?.textContent).not.toContain('Há 2 notas livres')
    })

    it(`${name}: número sem nota e texto sem sentido avisam em uma frase`, () => {
      mount()
      bip('999')
      expect(container?.textContent).toContain('Nenhuma nota livre com este número')
      bip('7891000100103')
      expect(statusTexts()).toContain('Leia a chave da nota ou digite o número dela.')
      expect(rows()).toHaveLength(0)
    })
  }

  it('com as notas livres ainda carregando, avisa para ler de novo', () => {
    mountIntake({ isLoading: true })
    bip('48214')

    expect(statusTexts().some((text) => text.includes('Carregando as notas'))).toBe(true)
  })
})

describe('corte da busca (M1)', () => {
  it('a nota com linha bipada sai das oferecidas pela busca', () => {
    const bippedRow: AccessKeyLookupRow = {
      accessKey: SOLO,
      lookupId: null,
      state: { documentId: 'doc-solo', kind: 'ready' },
    }

    expect(excludeBippedDocuments(FREE_NOTES, [bippedRow]).map((item) => item.id)).toEqual([
      'doc-twin-a',
      'doc-twin-b',
    ])
  })
})

describe('acessibilidade (L2)', () => {
  it('o botão de tentar de novo fica fora do role="alert"', async () => {
    client.documents.set(REGISTERED, 'doc-registered')
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root?.render(
        createElement(
          BippedNotesOverridesContext.Provider,
          {
            value: { ...overrides(), findDocument: () => Promise.reject(new Error('down')) },
          },
          createElement(TripNoteIntake, {
            documents: [],
            isLoading: false,
            onFilteredChange: () => undefined,
            onStage: () => undefined,
            stagedDocumentIds: [],
          }),
        ),
      )
    })
    bip(REGISTERED)
    await settle()

    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Não foi possível conferir esta nota')
    expect(alert?.querySelector('button')).toBeNull()
    expect(findButton(container, 'Tentar de novo')).toBeDefined()
  })

  it('a linha que termina é anunciada numa região educada', async () => {
    client.documents.clear()
    client.requestResponses.set(REGISTERED, () =>
      Promise.resolve({
        kind: 'lookup',
        lookup: view({ id: 'lookup-registered', status: 'queued' }),
      }),
    )
    client.getResponses.set('lookup-registered', () =>
      Promise.resolve(
        view({ documentId: 'doc-registered', id: 'lookup-registered', status: 'imported' }),
      ),
    )
    mountIntake()
    bip(REGISTERED)
    await settle()

    const live = container?.querySelector('p[aria-live="polite"][role="status"]')
    expect(live?.textContent).toContain('pronta')
  })
})

describe('câmera aberta entre leituras (H2)', () => {
  it('as duas telas não fecham a câmera ao ler, e devolvem o foco ao leitor ao fechar', () => {
    for (const path of [
      'src/modules/trip/components/TripBippedNotes.component.tsx',
      'src/modules/nfe-workspace/components/AccessKeyImportPanel.component.tsx',
    ]) {
      const source = readFileSync(path, 'utf8')
      const readHandler = source.slice(
        source.indexOf('function handleCameraRead'),
        source.indexOf('function handleCloseScanner'),
      )

      expect(readHandler).not.toContain('setIsScannerOpen(false)')
      expect(source).toContain('onClose={handleCloseScanner}')
      expect(source).toContain('readerRef.current?.focus()')
    }
  })
})
