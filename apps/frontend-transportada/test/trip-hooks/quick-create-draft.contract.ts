/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O rascunho da montagem manual exercitado pelo hook de verdade. ⚠️ O manual não calcula proposta:
 * a única espera assíncrona é a releitura das notas na volta, e é nela que "Limpar rascunho" corre.
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
const DRAFT_KEY = buildTripAssemblyDraftKey({ mode: TRIP_ASSEMBLY_DRAFT_MODE.manual, scope: SCOPE })

const { useTripQuickCreate } = await import('@/modules/trip/hooks/useTripQuickCreate.hook')

function renderQuickCreate() {
  return renderHook(() =>
    useTripQuickCreate({
      draftScope: SCOPE,
      onCreated: () => undefined,
      permissions: [],
      selectableDriverIds: [],
      selectableVehicleIds: [VEHICLE_ID],
    }),
  )
}

/** A montagem que o operador deixou ao sair para medir — gravada antes de a tela montar. */
function seedStoredDraft(storage: RecordingStorage): null | string {
  writeTripAssemblyDraft({
    draft: {
      dailyAllowanceDaysInput: null,
      documentIds: [DOCUMENT.id],
      driverIds: [],
      isOpen: true,
      routeChoice: null,
      stopOrderDocumentIds: [DOCUMENT.id],
      vehicleId: VEHICLE_ID,
    },
    mode: TRIP_ASSEMBLY_DRAFT_MODE.manual,
    now: Date.now(),
    scope: SCOPE,
    storage,
  })
  storage.writes.length = 0
  return storage.getItem(DRAFT_KEY)
}

describe('rascunho da montagem manual no hook', () => {
  let storage: RecordingStorage
  let hook: RenderedHook<ReturnType<typeof useTripQuickCreate>> | undefined

  beforeEach(() => {
    storage = createRecordingStorage()
    installSessionStorage(storage)
    resetTripHookFakes([DOCUMENT])
  })

  afterEach(() => {
    hook?.unmount()
    hook = undefined
  })

  test('"Limpar rascunho" durante a volta ignora as notas que chegam depois e não regrava', async () => {
    seedStoredDraft(storage)
    const documentsLoad = createDeferred<readonly TripCandidateDocument[]>()
    fakes.loadDocuments = () => documentsLoad.promise

    hook = await renderQuickCreate()
    const rendered = hook
    await waitFor(() => expect(rendered.result().draftStore.isRestoring).toBe(true))

    act(() => rendered.result().discardDraft())
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
    const writesAfterClear = storage.writes.length

    act(() => documentsLoad.resolve([DOCUMENT]))
    await settle()
    await settle()

    expect(rendered.result().draftStore.isRestoring).toBe(false)
    expect(rendered.result().isOpen).toBe(false)
    expect(rendered.result().stagedCount).toBe(0)
    expect(rendered.result().vehicleId).toBe('')
    expect(rendered.result().hasDraft).toBe(false)
    expect(storage.writes.length).toBe(writesAfterClear)
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
  })

  test('na volta, a busca de notas falhando deixa a fase "unreachable" sem escrever no storage', async () => {
    const storedRaw = seedStoredDraft(storage)
    fakes.loadDocuments = () => Promise.reject(new Error('NETWORK_DOWN'))

    hook = await renderQuickCreate()
    const rendered = hook
    await waitFor(() => expect(rendered.result().draftStore.isUnreachable).toBe(true))
    await settle()

    expect(rendered.result().draftStore.isRestoring).toBe(false)
    expect(rendered.result().isOpen).toBe(false)
    expect(rendered.result().stagedCount).toBe(0)
    expect(storage.writes).toEqual([])
    expect(storage.removals).toEqual([])
    expect(storage.getItem(DRAFT_KEY)).toBe(storedRaw)
  })
})
