/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a: só o que mudou é gravado — o veredito igual ao gravado não vira escrita nem
 * evento, e é por isso que reavaliar de novo é no-op.
 */
import { describe, expect, test } from 'bun:test'

import { diffPreviewMatches } from '../../src/cargo-preview/domain/cargo-preview-match-diff.policy.js'
import { readColumnMap } from '../../src/cargo-preview/domain/cargo-preview-items.policy.js'

describe('o que muda no item (spec 237 RF5a)', () => {
  const waiting = {
    candidateDocumentIds: [],
    evidence: [],
    id: 'i1',
    matchState: 'awaiting_xml' as const,
  }

  test('espera que continua espera não grava nada', () => {
    expect(
      diffPreviewMatches({
        current: [waiting],
        matches: [{ documentIds: [], evidence: [], itemKey: 'i1', state: 'awaiting_xml' }],
      }),
    ).toEqual([])
  })

  test('espera que vira vínculo grava a nota do grupo e o evento item_matched', () => {
    expect(
      diffPreviewMatches({
        current: [waiting],
        matches: [
          { documentIds: ['d1'], evidence: ['value', 'weight'], itemKey: 'i1', state: 'matched' },
        ],
      }),
    ).toEqual([
      {
        candidateDocumentIds: ['d1'],
        eventKind: 'item_matched',
        evidence: ['value', 'weight'],
        groupDocumentId: 'd1',
        itemId: 'i1',
        state: 'matched',
      },
    ])
  })

  test('ambíguo não tem nota de grupo; sugestão tem', () => {
    const changes = diffPreviewMatches({
      current: [waiting, { ...waiting, id: 'i2' }],
      matches: [
        {
          documentIds: ['d1', 'd2'],
          evidence: ['value', 'weight'],
          itemKey: 'i1',
          state: 'ambiguous',
        },
        { documentIds: ['d3'], evidence: ['value'], itemKey: 'i2', state: 'suggested' },
      ],
    })
    expect(changes.map((change) => [change.groupDocumentId, change.eventKind])).toEqual([
      [null, 'item_ambiguous'],
      ['d3', 'item_suggested'],
    ])
  })

  test('item fora da lista em aberto (decidido pelo operador) nunca entra', () => {
    expect(
      diffPreviewMatches({
        current: [],
        matches: [{ documentIds: ['d1'], evidence: ['value'], itemKey: 'i9', state: 'matched' }],
      }),
    ).toEqual([])
  })
})

describe('o mapa de colunas do perfil (spec 237 RF4)', () => {
  test('aceita só campos da prévia com nome de coluna', () => {
    expect(readColumnMap({ routeName: 'RouteName', value: 'VALOR' })).toEqual({
      routeName: 'RouteName',
      value: 'VALOR',
    })
    expect(readColumnMap({ routeName: 'RouteName', taxId: 'CNPJ' })).toBeUndefined()
    expect(readColumnMap({})).toBeUndefined()
    expect(readColumnMap(null)).toBeUndefined()
  })
})
