/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.1 (RF6): a "organização por cidade" é o agrupamento, não um estado. O grupo é
 * `(rota, cidade)`, a ordem é estável — rota, cidade, número da nota — e cada grupo diz o que falta.
 */
import { describe, expect, test } from 'bun:test'

import {
  groupArrivalDocuments,
  type GroupableArrivalDocument,
} from '../../src/cargo-receiving/domain/cargo-arrival-grouping.policy.js'

function document(
  id: string,
  overrides: Partial<GroupableArrivalDocument> = {},
): GroupableArrivalDocument {
  return {
    cityIbgeCode: '3548906',
    nfeDocumentId: id,
    number: id,
    routeName: 'FR.S.CAR',
    separationState: 'expected',
    ...overrides,
  }
}

const COUNTS_ZERO = { expected: 0, received: 0, separated: 0, total: 0 }

describe('o agrupamento rota × cidade da chegada (spec 237 T2.1)', () => {
  test('agrupa por rota e cidade, e conta cada estado', () => {
    const groups = groupArrivalDocuments([
      document('10', { separationState: 'separated' }),
      document('11', { separationState: 'received' }),
      document('12', { cityIbgeCode: '3529302' }),
      document('9'),
    ])

    expect(groups.map((group) => [group.routeName, group.cityIbgeCode])).toEqual([
      ['FR.S.CAR', '3529302'],
      ['FR.S.CAR', '3548906'],
    ])
    expect(groups[1]?.counts).toEqual({ expected: 1, received: 1, separated: 1, total: 3 })
    expect(groups[0]?.counts).toEqual({ ...COUNTS_ZERO, expected: 1, total: 1 })
  })

  test('dentro do grupo, a nota vem pelo número em ordem numérica, não de texto', () => {
    const [group] = groupArrivalDocuments([document('100'), document('9'), document('10')])

    expect(group?.documents.map((item) => item.number)).toEqual(['9', '10', '100'])
  })

  test('rota e cidade ausentes vão para o fim, nunca para o começo', () => {
    const groups = groupArrivalDocuments([
      document('1', { cityIbgeCode: null, routeName: null }),
      document('2', { routeName: null }),
      document('3', { cityIbgeCode: null }),
      document('4', { routeName: 'FR.BARRE' }),
      document('5'),
    ])

    expect(groups.map((group) => [group.routeName, group.cityIbgeCode])).toEqual([
      ['FR.BARRE', '3548906'],
      ['FR.S.CAR', '3548906'],
      ['FR.S.CAR', null],
      [null, '3548906'],
      [null, null],
    ])
  })

  test('a ordem não depende da ordem de entrada (empate pelo id)', () => {
    const items = [
      document('a', { number: '7' }),
      document('b', { number: '7' }),
      document('c', { cityIbgeCode: '3501608', routeName: 'FR.MATAO' }),
      document('d', { routeName: 'FR.BARRE' }),
    ]
    const forward = groupArrivalDocuments(items)
    const backward = groupArrivalDocuments([...items].reverse())

    expect(backward).toEqual(forward)
    expect(forward[2]?.documents.map((item) => item.nfeDocumentId)).toEqual(['a', 'b'])
  })

  test('chegada sem nota não tem grupo', () => {
    expect(groupArrivalDocuments([])).toEqual([])
  })
})
