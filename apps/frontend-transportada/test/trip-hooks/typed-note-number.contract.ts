/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * No "Vincular nota" da viagem o número vira o id da nota, e a busca vincula cada nota marcada, com
 * a recusa na linha dela. (A inserção rápida da nova viagem não digita número desde a spec 298 T3.2:
 * o leitor só lê chave e o número se busca em "Buscar notas".)
 */
import { act } from 'react'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import type { TripCandidateDocument } from '@/modules/trip/shared/trip.types'

import { buildCandidateDocument } from '../fixtures/tripAssemblyHooks.fixture'
import { renderHook, type RenderedHook } from './renderHook.helper'

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
