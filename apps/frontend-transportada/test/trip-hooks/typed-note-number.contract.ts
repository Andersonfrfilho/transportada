/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Número de nota digitado na inserção rápida: vira linha quando só uma nota livre o tem, pede
 * escolha quando há mais de uma e avisa quando não há nenhuma. No "Vincular nota" da viagem o
 * mesmo número vira o id da nota, e a busca vincula cada nota marcada, com a recusa na linha dela.
 */
import { act } from 'react'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import type { TripCandidateDocument } from '@/modules/trip/shared/trip.types'

import {
  buildCandidateDocument,
  createRecordingStorage,
  installSessionStorage,
} from '../fixtures/tripAssemblyHooks.fixture'
import { renderHook, settle, waitFor, type RenderedHook } from './renderHook.helper'
import { resetTripHookFakes } from './tripClientMocks.helper'

const SCOPE = { companyId: 'company-1', userId: 'user-1' } as const

const { useTripQuickCreate } = await import('@/modules/trip/hooks/useTripQuickCreate.hook')
const { useTripDocumentLinkForm } = await import(
  '@/modules/trip/hooks/useTripDocumentLinkForm.hook'
)

function note(id: string, number: string, series: string): TripCandidateDocument {
  return {
    ...buildCandidateDocument(id),
    accessKey: `3526090000000000000055001${id.padStart(19, '0')}`.slice(0, 44),
    number,
    series,
  }
}

const SOLO = note('1', '48214', '1')
const TWIN_A = note('2', '1207', '1')
const TWIN_B = note('3', '1207', '3')

describe('inserção rápida da nova viagem aceita o número da nota', () => {
  let rendered: RenderedHook<ReturnType<typeof useTripQuickCreate>> | undefined

  beforeEach(async () => {
    installSessionStorage(createRecordingStorage())
    resetTripHookFakes([SOLO, TWIN_A, TWIN_B])
    rendered = await renderHook(() =>
      useTripQuickCreate({
        draftScope: SCOPE,
        onCreated: () => undefined,
        permissions: [],
        selectableDriverIds: [],
        selectableHelperIds: [],
        selectableVehicleIds: [],
      }),
    )
    act(() => rendered?.result().open())
    await waitFor(() => {
      expect(rendered?.result().availableDocuments).toHaveLength(3)
    })
  })

  afterEach(() => {
    rendered?.unmount()
    rendered = undefined
  })

  test('um número com uma nota livre entra na fila sem consultar a API', async () => {
    act(() => rendered?.result().submitTyped('48214'))
    await settle()

    expect(rendered?.result().stagedDocuments.map((document) => document.id)).toEqual(['1'])
    expect(rendered?.result().typedNote).toBeUndefined()
  })

  test('número repetido pede escolha e não entra sozinho', async () => {
    act(() => rendered?.result().submitTyped('1207'))
    await settle()

    expect(rendered?.result().stagedDocuments).toHaveLength(0)
    const note = rendered?.result().typedNote
    expect(note?.kind === 'ambiguous' && note.candidates.map((c) => c.id)).toEqual(['2', '3'])
  })

  test('número sem nota livre avisa, e texto sem sentido também', async () => {
    act(() => rendered?.result().submitTyped('999'))
    await settle()
    expect(rendered?.result().typedNote).toEqual({ kind: 'notFound' })

    act(() => rendered?.result().submitTyped('nota'))
    await settle()
    expect(rendered?.result().typedNote).toEqual({ kind: 'unrecognized' })
  })
})

describe('"Vincular nota" da viagem aceita número e vincula a seleção da busca', () => {
  const linked: string[] = []
  let failFor: string | undefined
  let rendered: RenderedHook<ReturnType<typeof useTripDocumentLinkForm>> | undefined

  beforeEach(async () => {
    linked.length = 0
    failFor = undefined
    rendered = await renderHook(() =>
      useTripDocumentLinkForm({
        availableDocuments: [SOLO, TWIN_A, TWIN_B] as unknown as readonly NfeDocumentListItem[],
        findNfeDocumentByAccessKey: () => Promise.resolve(null),
        linkScannedDocument: ({ documentId }) => {
          if (documentId === failFor) return Promise.reject(new Error('boom'))
          linked.push(documentId)
          return Promise.resolve(undefined)
        },
      }),
    )
  })

  afterEach(() => {
    rendered?.unmount()
    rendered = undefined
  })

  test('o número de uma nota livre vira o id dela', async () => {
    act(() => rendered?.result().setValue('48214'))
    let id: string | undefined
    await act(async () => {
      id = await rendered?.result().resolveDocumentId()
    })

    expect(id).toBe('1')
  })

  test('número repetido devolve as candidatas e não escolhe', async () => {
    act(() => rendered?.result().setValue('1207'))
    let id: string | undefined = 'x'
    await act(async () => {
      id = await rendered?.result().resolveDocumentId()
    })

    expect(id).toBeUndefined()
    expect(rendered?.result().candidates.map((c) => c.id)).toEqual(['2', '3'])
  })

  test('número sem nota livre vira recusa nomeada', async () => {
    act(() => rendered?.result().setValue('999'))
    await act(async () => {
      await rendered?.result().resolveDocumentId()
    })

    expect(rendered?.result().issue).toBe('noteNumberNotFound')
  })

  test('identificador (UUID) segue direto, sem passar pelo número', async () => {
    act(() => rendered?.result().setValue('ef64efdd-b338-45e0-9bc2-77bd779d7fb3'))
    let id: string | undefined
    await act(async () => {
      id = await rendered?.result().resolveDocumentId()
    })

    expect(id).toBe('ef64efdd-b338-45e0-9bc2-77bd779d7fb3')
  })

  test('a busca vincula cada nota marcada; a que falha não derruba as outras', async () => {
    failFor = '2'
    await act(async () => {
      await rendered?.result().linkDocuments([SOLO, TWIN_A, TWIN_B])
    })

    expect(linked).toEqual(['1', '3'])
    const byKey = new Map(rendered?.result().scanEntries.map((e) => [e.accessKey, e.status]))
    expect(byKey.get(SOLO.accessKey)).toBe('linked')
    expect(byKey.get(TWIN_A.accessKey)).toBe('refused')
    expect(byKey.get(TWIN_B.accessKey)).toBe('linked')
  })
})
