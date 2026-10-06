/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9, `web.md` §7): a lista de chegadas — ordenação por cabeçalho (asc → desc →
 * neutro), filtros de seleção múltipla, "limpar filtros" só com critério e o estado todo na URL.
 */
import { describe, expect, test } from 'bun:test'

import {
  applyCargoArrivalTable,
  EMPTY_CARGO_ARRIVAL_TABLE_STATE,
  hasCargoArrivalTableCriteria,
  parseCargoArrivalTableState,
  resolveServerFilters,
  serializeCargoArrivalTableState,
  toggleCargoArrivalSort,
} from '@/modules/cargo-receiving/shared/cargoArrivalTable.service'

import { ALFA_ID, BETA_ID, buildSummary } from '../fixtures/cargoReceiving.fixture'

const ARRIVALS = [
  buildSummary({
    arrivedAt: '2026-10-03T12:00:00.000Z',
    contractorId: ALFA_ID,
    contractorName: 'Alfa Indústria Fictícia',
    counts: { expected: 2, received: 0, separated: 2, total: 4 },
    id: 'a1',
    separationDueAt: '2026-10-04T12:00:00.000Z',
    status: 'open',
  }),
  buildSummary({
    arrivedAt: '2026-10-02T09:00:00.000Z',
    contractorId: BETA_ID,
    contractorName: 'Beta Comércio Fictício',
    counts: { expected: 0, received: 0, separated: 10, total: 10 },
    id: 'b1',
    separationDueAt: null,
    status: 'closed',
  }),
  buildSummary({
    arrivedAt: '2026-10-01T09:00:00.000Z',
    contractorId: ALFA_ID,
    contractorName: 'Alfa Indústria Fictícia',
    counts: { expected: 5, received: 0, separated: 0, total: 5 },
    id: 'a2',
    separationDueAt: '2026-10-02T09:00:00.000Z',
    status: 'open',
  }),
]

const ids = (state: Parameters<typeof applyCargoArrivalTable>[0]['state']) =>
  applyCargoArrivalTable({ arrivals: ARRIVALS, state }).map((arrival) => arrival.id)

describe('a ordenação por cabeçalho (spec 237 T2.4)', () => {
  test('alterna ascendente, descendente e neutro; outra coluna recomeça em ascendente', () => {
    const first = toggleCargoArrivalSort({ column: 'contractor', current: null })
    const second = toggleCargoArrivalSort({ column: 'contractor', current: first })
    const third = toggleCargoArrivalSort({ column: 'contractor', current: second })

    expect(first).toEqual({ column: 'contractor', direction: 'asc' })
    expect(second).toEqual({ column: 'contractor', direction: 'desc' })
    expect(third).toBeNull()
    expect(toggleCargoArrivalSort({ column: 'status', current: second })).toEqual({
      column: 'status',
      direction: 'asc',
    })
  })

  test('sem ordenação a lista mantém a ordem do servidor (chegada mais nova primeiro)', () => {
    expect(ids(EMPTY_CARGO_ARRIVAL_TABLE_STATE)).toEqual(['a1', 'b1', 'a2'])
  })

  test.each([
    ['contractor', 'asc', ['a1', 'a2', 'b1']],
    ['arrivedAt', 'asc', ['a2', 'b1', 'a1']],
    ['arrivedAt', 'desc', ['a1', 'b1', 'a2']],
    ['documents', 'desc', ['b1', 'a2', 'a1']],
    ['progress', 'desc', ['b1', 'a1', 'a2']],
    ['status', 'asc', ['a1', 'a2', 'b1']],
  ] as const)('ordena por %s %s', (column, direction, expected) => {
    expect(ids({ ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, sort: { column, direction } })).toEqual([
      ...expected,
    ])
  })

  test('o prazo ordena do mais próximo ao mais distante, e sem prazo vai por último nos dois sentidos', () => {
    expect(
      ids({ ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, sort: { column: 'dueAt', direction: 'asc' } }),
    ).toEqual(['a2', 'a1', 'b1'])
    expect(
      ids({ ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, sort: { column: 'dueAt', direction: 'desc' } }),
    ).toEqual(['a1', 'a2', 'b1'])
  })
})

describe('os filtros de seleção múltipla', () => {
  test('contratante aceita vários; seleção vazia é "sem filtro", nunca "esconder tudo"', () => {
    expect(ids({ ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, contractorIds: [ALFA_ID] })).toEqual([
      'a1',
      'a2',
    ])
    expect(ids({ ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, contractorIds: [ALFA_ID, BETA_ID] })).toEqual([
      'a1',
      'b1',
      'a2',
    ])
    expect(ids({ ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, contractorIds: [] })).toHaveLength(3)
  })

  test('situação também é de seleção múltipla e combina com o contratante', () => {
    expect(ids({ ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, statuses: ['closed'] })).toEqual(['b1'])
    expect(ids({ ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, statuses: ['open', 'closed'] })).toHaveLength(
      3,
    )
    expect(ids({ contractorIds: [ALFA_ID], sort: null, statuses: ['closed'] })).toEqual([])
  })

  test('com um valor só o filtro vai ao servidor; com vários, o cliente filtra o que veio', () => {
    expect(
      resolveServerFilters({ ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, contractorIds: [ALFA_ID] }),
    ).toEqual({ contractorId: ALFA_ID })
    expect(
      resolveServerFilters({
        contractorIds: [ALFA_ID, BETA_ID],
        sort: null,
        statuses: ['open'],
      }),
    ).toEqual({ status: 'open' })
    expect(resolveServerFilters(EMPTY_CARGO_ARRIVAL_TABLE_STATE)).toEqual({})
  })
})

describe('"limpar filtros" só existe com critério aplicado', () => {
  test('sem filtro nem ordenação não há critério', () => {
    expect(hasCargoArrivalTableCriteria(EMPTY_CARGO_ARRIVAL_TABLE_STATE)).toBe(false)
  })

  test.each([
    ['contratante', { ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, contractorIds: [ALFA_ID] }],
    ['situação', { ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, statuses: ['open'] }],
    [
      'ordenação',
      { ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, sort: { column: 'status', direction: 'asc' } },
    ],
  ] as const)('%s é critério', (_label, state) => {
    expect(hasCargoArrivalTableCriteria(state)).toBe(true)
  })
})

describe('o estado vai para a URL e volta dela', () => {
  test('escreve só o que está aplicado e preserva parâmetro de outro dono', () => {
    const search = serializeCargoArrivalTableState({
      search: '?utm=x',
      state: {
        contractorIds: [ALFA_ID, BETA_ID],
        sort: { column: 'dueAt', direction: 'desc' },
        statuses: ['open'],
      },
    })
    const parameters = new URLSearchParams(search)

    expect(parameters.get('contractor')).toBe(`${ALFA_ID},${BETA_ID}`)
    expect(parameters.get('status')).toBe('open')
    expect(parameters.get('sort')).toBe('dueAt')
    expect(parameters.get('dir')).toBe('desc')
    expect(parameters.get('utm')).toBe('x')
  })

  test('estado vazio tira os parâmetros da URL', () => {
    const search = serializeCargoArrivalTableState({
      search: `?contractor=${ALFA_ID}&status=open&sort=status&dir=asc&utm=x`,
      state: EMPTY_CARGO_ARRIVAL_TABLE_STATE,
    })

    expect(search).toBe('?utm=x')
  })

  test('lê a URL de volta; valor inventado é ignorado, nunca recusado', () => {
    expect(
      parseCargoArrivalTableState(
        `?contractor=${ALFA_ID},${ALFA_ID}&status=open,lost&sort=status&dir=desc`,
      ),
    ).toEqual({
      contractorIds: [ALFA_ID],
      sort: { column: 'status', direction: 'desc' },
      statuses: ['open'],
    })
    expect(parseCargoArrivalTableState('?sort=inexistente&dir=up')).toEqual(
      EMPTY_CARGO_ARRIVAL_TABLE_STATE,
    )
    expect(parseCargoArrivalTableState('')).toEqual(EMPTY_CARGO_ARRIVAL_TABLE_STATE)
  })
})
