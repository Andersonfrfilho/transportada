/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O ciclo do rascunho com um `restore` que lança. ⚠️ As funções de volta da montagem capturam as
 * próprias falhas de rede, então o caso só se alcança pelo ciclo direto — e é ele que decide o que
 * acontece com o rascunho guardado quando a volta quebra.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act } from 'react'

import { useTripAssemblyDraftLifecycle } from '@/modules/trip/hooks/useTripAssemblyDraftLifecycle.hook'
import {
  buildTripAssemblyDraftKey,
  TRIP_ASSEMBLY_DRAFT_MODE,
  writeTripAssemblyDraft,
} from '@/modules/trip/shared/tripAssemblyDraftStorage.service'

import {
  createDeferred,
  createRecordingStorage,
  installSessionStorage,
  type RecordingStorage,
} from '../fixtures/tripAssemblyHooks.fixture'
import { renderHook, settle, waitFor, type RenderedHook } from './renderHook.helper'

type SuggestionDraft = Readonly<{ suggestionIds: readonly string[] }>

const SCOPE = { companyId: 'company-1', userId: 'user-1' } as const
const MODE = TRIP_ASSEMBLY_DRAFT_MODE.automatic
const DRAFT_KEY = buildTripAssemblyDraftKey({ mode: MODE, scope: SCOPE })
const STORED_DRAFT: SuggestionDraft = { suggestionIds: ['suggestion-1'] }
const EMPTY_DRAFT: SuggestionDraft = { suggestionIds: [] }

function isSuggestionDraft(value: unknown): value is SuggestionDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { suggestionIds?: unknown }).suggestionIds)
  )
}

function renderLifecycle(
  input: Readonly<{
    discarded: SuggestionDraft[]
    restore: () => Promise<() => void>
  }>,
) {
  return renderHook(() =>
    useTripAssemblyDraftLifecycle<SuggestionDraft>({
      draft: EMPTY_DRAFT,
      isDraft: isSuggestionDraft,
      isEmpty: (draft) => draft.suggestionIds.length === 0,
      mode: MODE,
      onRestoreDiscarded: (draft) => input.discarded.push(draft),
      reset: () => undefined,
      restore: input.restore,
      scope: SCOPE,
    }),
  )
}

describe('ciclo do rascunho com a volta lançando exceção', () => {
  let storage: RecordingStorage
  let hook: RenderedHook<ReturnType<typeof useTripAssemblyDraftLifecycle>> | undefined

  beforeEach(() => {
    storage = createRecordingStorage()
    installSessionStorage(storage)
    writeTripAssemblyDraft({
      draft: STORED_DRAFT,
      mode: MODE,
      now: Date.now(),
      scope: SCOPE,
      storage,
    })
    storage.writes.length = 0
  })

  afterEach(() => {
    hook?.unmount()
    hook = undefined
  })

  test('a volta que lança encerra o rascunho guardado antes de ele ser apagado', async () => {
    const discarded: SuggestionDraft[] = []
    hook = await renderLifecycle({
      discarded,
      restore: () => Promise.reject(new Error('UNEXPECTED_RESTORE_FAILURE')),
    })
    const rendered = hook
    await waitFor(() => expect(rendered.result().isRestoring).toBe(false))
    await settle()

    /** Vazio em vez de preso em "retomando" — e a sugestão que só o rascunho apontava é encerrada. */
    expect(discarded).toEqual([STORED_DRAFT])
    expect(rendered.result().isUnreachable).toBe(false)
    expect(storage.writes).toEqual([])
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
  })

  test('a volta que lança depois de "Limpar rascunho" não encerra de novo', async () => {
    const discarded: SuggestionDraft[] = []
    const restoreResult = createDeferred<() => void>()
    hook = await renderLifecycle({
      discarded,
      restore: () => restoreResult.promise.then(() => Promise.reject(new Error('LATE_FAILURE'))),
    })
    const rendered = hook
    await waitFor(() => expect(rendered.result().isRestoring).toBe(true))

    /** Quem limpa já recusou o que o rascunho apontava (`readUnrestored`). */
    act(() => rendered.result().clear())
    act(() => restoreResult.resolve(() => undefined))
    await settle()
    await settle()

    expect(discarded).toEqual([])
    expect(storage.getItem(DRAFT_KEY)).toBeNull()
  })
})
