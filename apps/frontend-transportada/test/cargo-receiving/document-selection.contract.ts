/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9): a seleção das notas da chegada — o limite de 300 do servidor, "selecionar todas
 * as listadas" e o contador. A tela nunca deixa mandar um pedido que a API recusaria só pelo tamanho.
 */
import { describe, expect, test } from 'bun:test'

import {
  clearListedDocuments,
  EMPTY_DOCUMENT_SELECTION,
  resolveSelectAllState,
  selectListedDocuments,
  toggleDocumentSelection,
} from '@/modules/cargo-receiving/shared/cargoDocumentSelection.service'
import { CARGO_ARRIVAL_LIMITS } from '@/modules/cargo-receiving/shared/cargoReceiving.constant'

import { buildAvailable } from '../fixtures/cargoReceiving.fixture'

const LIMIT = CARGO_ARRIVAL_LIMITS.documentsPerRequest

function listOf(count: number, firstNumber = 1) {
  return Array.from({ length: count }, (_, index) => buildAvailable(firstNumber + index))
}

describe('a seleção das notas da chegada (spec 237 T2.4)', () => {
  test('o limite do servidor é 300 notas por chegada', () => {
    expect(LIMIT).toBe(300)
  })

  test('marcar e desmarcar uma nota, na ordem em que foram marcadas', () => {
    const first = buildAvailable(1)
    const second = buildAvailable(2)

    const marked = toggleDocumentSelection({
      document: second,
      selection: toggleDocumentSelection({ document: first, selection: EMPTY_DOCUMENT_SELECTION })
        .selection,
    })
    expect([...marked.selection.keys()]).toEqual([first.id, second.id])
    expect(marked.isLimited).toBe(false)

    const unmarked = toggleDocumentSelection({ document: first, selection: marked.selection })
    expect([...unmarked.selection.keys()]).toEqual([second.id])
  })

  test('a nota 301 não entra e a seleção avisa que bateu no limite', () => {
    const full = selectListedDocuments({
      documents: listOf(LIMIT),
      selection: EMPTY_DOCUMENT_SELECTION,
    })
    expect(full.selection.size).toBe(LIMIT)
    expect(full.isLimited).toBe(false)

    const over = toggleDocumentSelection({
      document: buildAvailable(LIMIT + 1),
      selection: full.selection,
    })
    expect(over.selection.size).toBe(LIMIT)
    expect(over.isLimited).toBe(true)
  })

  test('desmarcar com a seleção cheia sempre funciona', () => {
    const full = selectListedDocuments({
      documents: listOf(LIMIT),
      selection: EMPTY_DOCUMENT_SELECTION,
    })

    const next = toggleDocumentSelection({ document: buildAvailable(1), selection: full.selection })

    expect(next.selection.size).toBe(LIMIT - 1)
    expect(next.isLimited).toBe(false)
  })

  test('selecionar todas as listadas acrescenta só até o limite e avisa', () => {
    const already = selectListedDocuments({
      documents: listOf(295),
      selection: EMPTY_DOCUMENT_SELECTION,
    }).selection

    const next = selectListedDocuments({ documents: listOf(10, 296), selection: already })

    expect(next.selection.size).toBe(LIMIT)
    expect(next.isLimited).toBe(true)
    expect(next.selection.has(buildAvailable(300).id)).toBe(true)
    expect(next.selection.has(buildAvailable(301).id)).toBe(false)
  })

  test('selecionar todas não duplica as que já estavam marcadas', () => {
    const some = toggleDocumentSelection({
      document: buildAvailable(2),
      selection: EMPTY_DOCUMENT_SELECTION,
    }).selection

    const next = selectListedDocuments({ documents: listOf(3), selection: some })

    expect(next.selection.size).toBe(3)
    expect(next.isLimited).toBe(false)
  })

  test('limpar as listadas tira só elas e preserva o que veio de outra busca', () => {
    const everything = selectListedDocuments({
      documents: listOf(5),
      selection: EMPTY_DOCUMENT_SELECTION,
    }).selection

    const next = clearListedDocuments({ documents: listOf(2), selection: everything })

    expect([...next.keys()]).toEqual([
      buildAvailable(3).id,
      buildAvailable(4).id,
      buildAvailable(5).id,
    ])
  })

  test('o estado do "selecionar todas" é nenhuma, algumas ou todas as listadas', () => {
    const listed = listOf(3)
    const one = toggleDocumentSelection({
      document: listed[0] ?? buildAvailable(1),
      selection: EMPTY_DOCUMENT_SELECTION,
    }).selection
    const all = selectListedDocuments({ documents: listed, selection: EMPTY_DOCUMENT_SELECTION })

    expect(resolveSelectAllState({ documents: listed, selection: EMPTY_DOCUMENT_SELECTION })).toBe(
      'none',
    )
    expect(resolveSelectAllState({ documents: listed, selection: one })).toBe('some')
    expect(resolveSelectAllState({ documents: listed, selection: all.selection })).toBe('all')
    expect(resolveSelectAllState({ documents: [], selection: one })).toBe('none')
  })
})
