/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b: a separação de uma chegada com nota devolvida nunca chegava a 100% (a nota devolvida segue
 * contada no total, e a marcada não se separa). O progresso conta só as notas que ainda se separam: as marcadas
 * ("a devolver") e as devolvidas ficam de fora do total — e a conta é nota a nota, porque a nota separada e
 * DEPOIS devolvida entra em `counts.separated` e descontá-la só do total esconderia uma nota por separar.
 */
import { describe, expect, test } from 'bun:test'

import { resolveSeparationProgress } from '@/modules/cargo-receiving/shared/cargoSeparationProgress.service'
import type { CargoDocumentReturn } from '@/modules/cargo-receiving/shared/cargoOccurrence.types'

import { buildReturn } from '../fixtures/cargoOccurrence.fixture'

type Note = { nfeDocumentId: string; separationState: 'expected' | 'received' | 'separated' }

const notes = (...states: Note['separationState'][]): Note[] =>
  states.map((separationState, index) => ({ nfeDocumentId: `n${String(index)}`, separationState }))

const returnsOf = (...entries: CargoDocumentReturn[]) =>
  new Map(entries.map((entry) => [entry.nfeDocumentId, entry]))

describe('o progresso da separação', () => {
  test('9 separadas e 1 devolvida leem como completo: 9 de 9', () => {
    const documents = notes(...Array.from({ length: 9 }, () => 'separated' as const), 'received')
    const returns = returnsOf(buildReturn('n9', 'returned', 'occ-1'))

    expect(resolveSeparationProgress({ documents, returns })).toEqual({ done: 9, total: 9 })
  })

  test('a nota a devolver (marcada) também sai: ela não se separa enquanto espera o contratante', () => {
    const documents = notes('separated', 'separated', 'received')
    const returns = returnsOf(buildReturn('n2', 'marked', 'occ-1'))

    expect(resolveSeparationProgress({ documents, returns })).toEqual({ done: 2, total: 2 })
  })

  test('a nota separada e DEPOIS devolvida não conta duas vezes: 9 separadas incluindo a devolvida é 8 de 9', () => {
    const documents = notes(...Array.from({ length: 9 }, () => 'separated' as const), 'received')
    const returns = returnsOf(buildReturn('n0', 'returned', 'occ-1'))

    expect(resolveSeparationProgress({ documents, returns })).toEqual({ done: 8, total: 9 })
  })

  test('sem devolução nada muda: separadas sobre o total', () => {
    expect(
      resolveSeparationProgress({
        documents: notes('separated', 'received', 'expected'),
        returns: new Map(),
      }),
    ).toEqual({ done: 1, total: 3 })
  })

  test('nota sem marcação conhecida conta como "none" (a leitura da marcação ainda não chegou)', () => {
    expect(
      resolveSeparationProgress({ documents: notes('separated'), returns: new Map() }),
    ).toEqual({ done: 1, total: 1 })
  })

  test('todas devolvidas: nada a separar, e a divisão nunca estoura', () => {
    const documents = notes('received', 'received')
    const returns = returnsOf(
      buildReturn('n0', 'returned', 'a'),
      buildReturn('n1', 'returned', 'b'),
    )

    expect(resolveSeparationProgress({ documents, returns })).toEqual({ done: 0, total: 0 })
  })
})
