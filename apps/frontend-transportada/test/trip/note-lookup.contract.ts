/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A inserção rápida aceita câmera, chave ou número da nota. O número é resolvido entre as notas
 * livres — nunca na API — e a ambiguidade vira escolha da pessoa, não palpite.
 */
import { describe, expect, it } from 'bun:test'

import type { NfeDocumentListItem } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import {
  isTypedNoteNumber,
  resolveTypedNote,
} from '../../src/modules/trip/shared/tripNoteLookup.service'

const KEY = '35261012345678000190550010000482141004821405'

function note(id: string, number: string, series: string): NfeDocumentListItem {
  return { accessKey: id === 'a' ? KEY : `k-${id}`, id, number, series } as NfeDocumentListItem
}

const documents = [note('a', '48214', '1'), note('b', '1207', '1'), note('c', '1207', '3')]

describe('resolveTypedNote', () => {
  it('texto vazio não faz nada', () => {
    expect(resolveTypedNote({ documents, text: '   ' })).toEqual({ kind: 'empty' })
  })

  it('a chave de 44 caracteres segue para a API, mesmo com espaços', () => {
    expect(resolveTypedNote({ documents, text: ` ${KEY} ` })).toEqual({
      accessKey: KEY,
      kind: 'accessKey',
    })
  })

  it('um número casa com uma nota livre, com ou sem zeros à esquerda', () => {
    for (const text of ['48214', '048214', ' 48214 ']) {
      const lookup = resolveTypedNote({ documents, text })
      expect(lookup.kind === 'matches' && lookup.matches.map((m) => m.id)).toEqual(['a'])
    }
  })

  it('número repetido devolve todas as candidatas; a série separa', () => {
    const both = resolveTypedNote({ documents, text: '1207' })
    expect(both.kind === 'matches' && both.matches.map((m) => m.id)).toEqual(['b', 'c'])
    const third = resolveTypedNote({ documents, text: '1207/3' })
    expect(third.kind === 'matches' && third.matches.map((m) => m.id)).toEqual(['c'])
  })

  it('número sem nota livre devolve lista vazia', () => {
    expect(resolveTypedNote({ documents, text: '999' })).toEqual({ kind: 'matches', matches: [] })
  })

  it('texto que não é número nem chave é recusado', () => {
    expect(resolveTypedNote({ documents, text: 'nota fiscal' })).toEqual({ kind: 'unrecognized' })
  })

  it('isTypedNoteNumber separa número de identificador (UUID) e de chave', () => {
    expect(isTypedNoteNumber('48214')).toBe(true)
    expect(isTypedNoteNumber('48214/1')).toBe(true)
    expect(isTypedNoteNumber('ef64efdd-b338-45e0-9bc2-77bd779d7fb3')).toBe(false)
    expect(isTypedNoteNumber(KEY)).toBe(false)
  })
})
