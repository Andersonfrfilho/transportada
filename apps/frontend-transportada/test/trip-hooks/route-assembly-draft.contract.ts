/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O rascunho da montagem automática exercitado pelo hook de verdade, com storage em memória e
 * cliente falso — as corridas que as funções puras não alcançam.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act } from 'react'

import type { TripCandidateDocument } from '@/modules/trip/shared/trip.types'
import {
  buildTripAssemblyDraftKey,
  TRIP_ASSEMBLY_DRAFT_MODE,
  writeTripAssemblyDraft,
} from '@/modules/trip/shared/tripAssemblyDraftStorage.service'

import {
  buildCandidateDocument,
  buildSuggestion,
  createDeferred,
  createRecordingStorage,
  installSessionStorage,
  type RecordingStorage,
} from '../fixtures/tripAssemblyHooks.fixture'
import { renderHook, settle, waitFor, type RenderedHook } from './renderHook.helper'
import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'

const SCOPE = { companyId: 'company-1', userId: 'user-1' } as const
const VEHICLE_ID = 'vehicle-1'
const DOCUMENT = buildCandidateDocument('document-1')
const DRAFT_KEY = buildTripAssemblyDraftKey({
  mode: TRIP_ASSEMBLY_DRAFT_MODE.automatic,
  scope: SCOPE,
})

const { useTripRouteAssembly } = await import('@/modules/trip/hooks/useTripRouteAssembly.hook')

function renderAssembly() {
  return renderHook(() =>
    useTripRouteAssembly({
      canManageTrips: true,
      draftScope: SCOPE,
      onCreated: () => undefined,
      selectableDriverIds: [],
      selectableVehicleIds: [VEHICLE_ID],
    }),
  )
}

function readStoredPendingSuggestionId(storage: RecordingStorage): unknown {
  const raw = storage.getItem(DRAFT_KEY)
  if (raw === null) return undefined
  const envelope = JSON.parse(raw) as { draft?: { pendingSuggestionId?: unknown } }
  return envelope.draft?.pendingSuggestionId
}

/** O pedido que ficou calculando quando o operador saiu para medir — gravado antes de a tela montar. */
function seedStoredDraft(storage: RecordingStorage): null | string {
  writeTripAssemblyDraft({
    draft: {
      documentIds: [DOCUMENT.id],
      driverIds: [],
      isOpen: true,
      pendingSuggestionId: 'suggestion-1',
      proposal: null,
      vehicleIds: [VEHICLE_ID],
    },
    mode: TRIP_ASSEMBLY_DRAFT_MODE.automatic,
    now: Date.now(),
    scope: SCOPE,
    storage,
  })
  storage.writes.length = 0
  return storage.getItem(DRAFT_KEY)
}

describe('rascunho da montagem automática no hook', () => {
  let storage: RecordingStorage
  let hook: RenderedHook<ReturnType<typeof useTripRouteAssembly>> | undefined

  beforeEach(() => {
    storage = createRecordingStorage()
    installSessionStorage(storage)
    resetTripHookFakes([DOCUMENT])
  })

  afterEach(() => {
    hook?.unmount()
    hook = undefined
  })

  test('"Limpar rascunho" no meio do cálculo ignora a proposta que chega depois e não regrava', async () => {
    const statusRead = createDeferred<ReturnType<typeof buildSuggestion>>()
    let proposalReads = 0
    fakes.tripClient = {
      createMultiVehicleSuggestion: () =>
        Promise.resolve(buildSuggestion({ id: 'suggestion-1', status: 'queued' })),
      readMultiVehicleProposal: () => {
        proposalReads += 1
        return Promise.resolve({
          stops: [],
          suggestion: buildSuggestion({ id: 'suggestion-1', status: 'ready' }),
        })
      },
      readMultiVehicleSuggestion: () => statusRead.promise,
    }
    hook = await renderAssembly()
    const rendered = hook
    act(() => rendered.result().setPool([DOCUMENT]))
    act(() => rendered.result().setVehicleIds([VEHICLE_ID]))
    act(() => rendered.result().proposeMutation.mutate())
    await waitFor(() => expect(readStoredPendingSuggestionId(storage)).toBe('suggestion-1'))

    act(() => rendered.result().discardDraft())
    expect(fakes.rejectedSuggestionIds).toContain('suggestion-1')
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
    const writesAfterClear = storage.writes.length

    act(() => statusRead.resolve(buildSuggestion({ id: 'suggestion-1', status: 'ready' })))
    await waitFor(() => expect(proposalReads).toBe(1))
    await settle()

    expect(rendered.result().proposal).toBeNull()
    expect(rendered.result().assemblyDraft.hasDraft).toBe(false)
    expect(rendered.result().canResumeSuggestion).toBe(false)
    expect(storage.writes.length).toBe(writesAfterClear)
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
  })

  test('"Limpar rascunho" durante a volta não retoma a sugestão nem aplica as notas que chegam depois', async () => {
    seedStoredDraft(storage)
    const documentsLoad = createDeferred<readonly TripCandidateDocument[]>()
    fakes.loadDocuments = () => documentsLoad.promise
    let suggestionReads = 0
    fakes.tripClient = {
      ...fakes.tripClient,
      readMultiVehicleSuggestion: () => {
        suggestionReads += 1
        return Promise.resolve(buildSuggestion({ id: 'suggestion-1', status: 'running' }))
      },
    }

    hook = await renderAssembly()
    const rendered = hook
    await waitFor(() => expect(rendered.result().assemblyDraft.isRestoring).toBe(true))

    act(() => rendered.result().discardDraft())
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
    const writesAfterClear = storage.writes.length

    act(() => documentsLoad.resolve([DOCUMENT]))
    /** A volta ainda lê o estado da sugestão guardada; retomar a espera seria a segunda leitura. */
    await waitFor(() => expect(suggestionReads).toBe(1))
    await settle()
    await settle()

    expect(suggestionReads).toBe(1)
    expect(rendered.result().proposeMutation.isPending).toBe(false)
    expect(rendered.result().canResumeSuggestion).toBe(false)
    expect(rendered.result().assemblyDraft.isRestoring).toBe(false)
    expect(rendered.result().isOpen).toBe(false)
    expect(rendered.result().pool).toEqual([])
    expect(rendered.result().assemblyDraft.hasDraft).toBe(false)
    expect(storage.writes.length).toBe(writesAfterClear)
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
  })

  test('na volta, a busca de notas falhando deixa a fase "unreachable" sem escrever no storage', async () => {
    const storedRaw = seedStoredDraft(storage)
    fakes.loadDocuments = () => Promise.reject(new Error('NETWORK_DOWN'))

    hook = await renderAssembly()
    const rendered = hook
    await waitFor(() => expect(rendered.result().assemblyDraft.isDocumentsUnreachable).toBe(true))
    await settle()

    expect(rendered.result().assemblyDraft.isRestoring).toBe(false)
    expect(rendered.result().isOpen).toBe(false)
    expect(rendered.result().pool).toEqual([])
    expect(storage.writes).toEqual([])
    expect(storage.removals).toEqual([])
    expect(storage.getItem(DRAFT_KEY)).toBe(storedRaw)
  })
})
