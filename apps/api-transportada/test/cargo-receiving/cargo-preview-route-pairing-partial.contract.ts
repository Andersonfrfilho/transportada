/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (correção da revisão da Fase 4a, H1/M2): com o XML chegando aos poucos, uma linha
 * de outro roteiro que coincide em valor e peso com a primeira nota da carga não pode parear o
 * roteiro errado — nem vincular a nota, nem ensinar o alias `Company → CNPJ`.
 */
import { describe, expect, test } from 'bun:test'

import {
  MIN_ROUTE_PAIR_VOTE_PERCENT,
  MIN_ROUTE_PAIR_VOTES,
} from '../../src/cargo-receiving/domain/cargo-preview-matching.constant.js'
import { resolveCargoPreviewMatches } from '../../src/cargo-receiving/domain/cargo-preview-matching.policy.js'
import type { CargoPreviewMatchItem } from '../../src/cargo-receiving/domain/cargo-preview-matching.types.js'
import { candidate, matchParams, previewItem } from '../fixtures/cargo-preview-matching.fixture.js'

const TRUE_ROUTE = 'FR.R1'
const OTHER_ROUTE = 'FR.R2'
const LOAD = '69380'
const COINCIDENT_CODE = '20099'

function trueRouteLine(index: number): CargoPreviewMatchItem {
  const isCoincident = index === 0
  return previewItem(`r1-${index}`, {
    recipientCode: String(10_000 + index),
    routeName: TRUE_ROUTE,
    value: isCoincident ? '100.00' : `${200 + index}.00`,
    weightKg: isCoincident ? '10.000' : '5.000',
  })
}

/** R2 é a carga de outro dia, sem XML; a última linha coincide com a primeira nota de R1. */
const otherRoute = [
  ...Array.from({ length: 4 }, (_unused, index) =>
    previewItem(`r2-${index}`, {
      recipientCode: String(20_000 + index),
      routeName: OTHER_ROUTE,
      value: `${500 + index}.00`,
      weightKg: '7.000',
    }),
  ),
  previewItem('r2-x', {
    recipientCode: COINCIDENT_CODE,
    routeName: OTHER_ROUTE,
    value: '100.00',
    weightKg: '10.000',
  }),
]
const items = [
  ...Array.from({ length: 20 }, (_unused, index) => trueRouteLine(index)),
  ...otherRoute,
]
const load = Array.from({ length: 20 }, (_unused, index) =>
  candidate(`d${String(index).padStart(2, '0')}`, {
    grossWeightKg: index === 0 ? '10.000' : '5.000',
    loadReference: LOAD,
    recipientTaxId: `9900000000${String(index).padStart(4, '0')}`,
    totalValue: index === 0 ? '100.00' : `${200 + index}.00`,
  }),
)

function resolveWith(arrived: number) {
  return resolveCargoPreviewMatches(matchParams({ candidates: load.slice(0, arrived), items }))
}

describe('o par roteiro ↔ carga com o XML parcial (spec 237 RF5a, H1)', () => {
  test('os votos exigem um mínimo: 2 votos e 25% das linhas do roteiro', () => {
    expect([MIN_ROUTE_PAIR_VOTES, MIN_ROUTE_PAIR_VOTE_PERCENT]).toEqual([2, 25])
  })

  test('uma nota da carga: um voto de cada roteiro não pareia nada, e a nota fica disputada', () => {
    const result = resolveWith(1)
    expect(result.routePairs).toEqual([])
    const byKey = new Map(result.items.map((item) => [item.itemKey, item]))
    expect(byKey.get('r2-x')).toMatchObject({ documentIds: ['d00'], state: 'ambiguous' })
    expect(byKey.get('r1-0')).toMatchObject({ documentIds: ['d00'], state: 'ambiguous' })
    expect(result.learnedAliases).toEqual([])
  })

  test.each([
    [5, 'votes' as const],
    [10, 'votes' as const],
    [20, 'totals' as const],
  ])('com %p notas da carga o par certo emerge (%p)', (arrived, source) => {
    const result = resolveWith(arrived)
    expect(result.routePairs).toEqual([{ loadReference: LOAD, routeName: TRUE_ROUTE, source }])
    const coincident = result.items.find((item) => item.itemKey === 'r2-x')
    expect(coincident).toMatchObject({ documentIds: [], state: 'awaiting_xml' })
  })

  test('em nenhum passo o roteiro errado pareia, vincula a nota ou ensina o alias', () => {
    for (const arrived of [1, 2, 3, 4, 5, 10, 15, 20]) {
      const result = resolveWith(arrived)
      expect(result.routePairs.filter((pair) => pair.routeName === OTHER_ROUTE)).toEqual([])
      const wrong = result.items.filter(
        (item) => item.itemKey.startsWith('r2-') && item.state === 'matched',
      )
      expect(wrong).toEqual([])
      const codes = result.learnedAliases.map((alias) => alias.recipientCode)
      expect(codes).not.toContain(COINCIDENT_CODE)
    }
  })

  test('com todas as notas, as 20 linhas de R1 vinculam pelo par de totais', () => {
    const states = resolveWith(20).items.filter((item) => item.itemKey.startsWith('r1-'))
    expect(states.every((item) => item.state === 'matched')).toBe(true)
  })

  test('a diferença de contagem não desempata: dois roteiros com o mesmo voto não pareiam', () => {
    const twins = [
      ...[0, 1, 2].map((index) =>
        previewItem(`a${index}`, {
          recipientCode: `1${index}`,
          routeName: 'FR.A',
          value: index < 2 ? '100.00' : '999.00',
        }),
      ),
      ...[0, 1, 2, 3, 4, 5].map((index) =>
        previewItem(`b${index}`, {
          recipientCode: `2${index}`,
          routeName: 'FR.B',
          value: index < 2 ? '100.00' : `${300 + index}.00`,
        }),
      ),
    ]
    const twoDocuments = ['d1', 'd2'].map((id) => candidate(id, { loadReference: LOAD }))
    const result = resolveCargoPreviewMatches(
      matchParams({ candidates: twoDocuments, items: twins }),
    )
    expect(result.routePairs).toEqual([])
  })

  test('abaixo de 25% das linhas do roteiro, 2 votos não pareiam', () => {
    const route = Array.from({ length: 10 }, (_unused, index) =>
      previewItem(`l${index}`, {
        recipientCode: `3${index}`,
        routeName: 'FR.C',
        value: `${100 + index}.00`,
      }),
    )
    const documents = [0, 1].map((index) =>
      candidate(`d${index}`, { loadReference: LOAD, totalValue: `${100 + index}.00` }),
    )
    const two = resolveCargoPreviewMatches(matchParams({ candidates: documents, items: route }))
    expect(two.routePairs).toEqual([])
    const three = resolveCargoPreviewMatches(
      matchParams({
        candidates: [...documents, candidate('d2', { loadReference: LOAD, totalValue: '102.00' })],
        items: route,
      }),
    )
    expect(three.routePairs).toEqual([{ loadReference: LOAD, routeName: 'FR.C', source: 'votes' }])
  })
})
