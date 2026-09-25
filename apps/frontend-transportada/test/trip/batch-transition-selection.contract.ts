/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * "Separar 4 notas" continuava na tela depois de as quatro estarem separadas: o botão do lote
 * contava a seleção inteira, sem olhar o estado de cada nota. O lote agora oferece e envia só o que
 * a linha da nota também ofereceria — separar o pendente, carregar o separado.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { selectBatchTransitionDocumentIds } from '@/modules/trip/shared/batchTransitionSelection.service'

const documents = [
  { id: 'pending-1', separationStatus: 'pending' },
  { id: 'pending-2', separationStatus: 'pending' },
  { id: 'separated-1', separationStatus: 'separated' },
  { id: 'loaded-1', separationStatus: 'loaded' },
  { id: 'returned-1', separationStatus: 'returned' },
] as const
const everything = new Set(documents.map((document) => document.id))

describe('o lote de separar/carregar só conta a nota em que a ação ainda cabe', () => {
  test('separar leva só as pendentes da seleção', () => {
    expect(
      selectBatchTransitionDocumentIds({ action: 'separate', documents, selectedIds: everything }),
    ).toEqual(['pending-1', 'pending-2'])
  })

  test('carregar leva só as separadas da seleção', () => {
    expect(
      selectBatchTransitionDocumentIds({ action: 'load', documents, selectedIds: everything }),
    ).toEqual(['separated-1'])
  })

  test('nota fora da seleção fica de fora mesmo que a ação caiba nela', () => {
    expect(
      selectBatchTransitionDocumentIds({
        action: 'separate',
        documents,
        selectedIds: new Set(['pending-2', 'loaded-1']),
      }),
    ).toEqual(['pending-2'])
  })

  test('seleção toda separada não oferece mais separar', () => {
    expect(
      selectBatchTransitionDocumentIds({
        action: 'separate',
        documents,
        selectedIds: new Set(['separated-1', 'loaded-1']),
      }),
    ).toEqual([])
  })
})

describe('a tela usa o recorte, não a seleção inteira', () => {
  const actions = readFileSync(
    new URL('../../src/modules/trip/components/TripStateActions.component.tsx', import.meta.url),
    'utf8',
  )
  const detail = readFileSync(
    new URL('../../src/modules/trip/components/TripDetail.component.tsx', import.meta.url),
    'utf8',
  )

  test('os botões contam e aparecem pelo recorte de cada ação', () => {
    expect(actions).toContain(
      "t('stateActions.batchSeparate', { count: separableSelection.length })",
    )
    expect(actions).toContain("t('stateActions.batchLoad', { count: loadableSelection.length })")
    expect(actions).not.toContain(
      "t('stateActions.batchSeparate', { count: selection.selectedIds.size })",
    )
    expect(actions).not.toContain(
      "t('stateActions.batchLoad', { count: selection.selectedIds.size })",
    )
  })

  test('o envio do lote manda o recorte, não a seleção inteira', () => {
    const handler = detail.slice(detail.indexOf('function handleBatch('))
    const body = handler.slice(0, handler.indexOf('\n  }\n'))

    expect(body).toContain('selectBatchTransitionDocumentIds(')
    expect(body).not.toContain('documentIds: [...selection.selectedIds]')
  })
})
