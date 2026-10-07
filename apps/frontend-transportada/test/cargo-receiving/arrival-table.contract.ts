/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9, `web.md` §7) e revisão das Fases 1–2 (M3): a lista de chegadas — ordenação por
 * cabeçalho (asc → desc → neutro), filtros de seleção múltipla, "limpar filtros" só com critério e o
 * estado todo na URL. Filtro e ordem vão inteiros ao servidor: o cliente não filtra nem ordena.
 */
import { describe, expect, test } from 'bun:test'

import {
  EMPTY_CARGO_ARRIVAL_TABLE_STATE,
  hasCargoArrivalTableCriteria,
  parseCargoArrivalTableState,
  resolveServerFilters,
  serializeCargoArrivalTableState,
  toggleCargoArrivalSort,
} from '@/modules/cargo-receiving/shared/cargoArrivalTable.service'

import { ALFA_ID, BETA_ID } from '../fixtures/cargoReceiving.fixture'

const GAMA_ID = '00000000-0000-4000-8000-000000237a03'

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
})

describe('filtro e ordem vão inteiros ao servidor (revisão M3)', () => {
  test('vários contratantes e várias situações seguem todos, na ordem em que foram marcados', () => {
    expect(
      resolveServerFilters({
        contractorIds: [ALFA_ID, BETA_ID, GAMA_ID],
        sort: null,
        statuses: ['closed', 'open'],
      }),
    ).toEqual({
      contractorIds: [ALFA_ID, BETA_ID, GAMA_ID],
      order: undefined,
      statuses: ['closed', 'open'],
    })
  })

  test('um valor só também vai: não existe mais "um filtra no servidor, vários no cliente"', () => {
    expect(
      resolveServerFilters({ ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, contractorIds: [ALFA_ID] }),
    ).toEqual({ contractorIds: [ALFA_ID], order: undefined, statuses: [] })
  })

  test('sem critério nada vai: o servidor responde na ordem padrão (chegada mais nova primeiro)', () => {
    expect(resolveServerFilters(EMPTY_CARGO_ARRIVAL_TABLE_STATE)).toEqual({
      contractorIds: [],
      order: undefined,
      statuses: [],
    })
  })

  test.each([
    ['arrivedAt', 'asc', 'arrivedAt'],
    ['arrivedAt', 'desc', 'arrivedAt'],
    ['contractor', 'asc', 'contractorName'],
    ['dueAt', 'desc', 'separationDueAt'],
    ['status', 'asc', 'status'],
  ] as const)('a coluna %s %s vira sort=%s no servidor', (column, direction, sort) => {
    expect(
      resolveServerFilters({ ...EMPTY_CARGO_ARRIVAL_TABLE_STATE, sort: { column, direction } })
        .order,
    ).toEqual({ direction, sort })
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
    // O servidor não ordena por notas nem por progresso: link antigo cai na ordem padrão.
    expect(parseCargoArrivalTableState('?sort=documents&dir=desc')).toEqual(
      EMPTY_CARGO_ARRIVAL_TABLE_STATE,
    )
    expect(parseCargoArrivalTableState('?sort=progress')).toEqual(EMPTY_CARGO_ARRIVAL_TABLE_STATE)
    expect(parseCargoArrivalTableState('')).toEqual(EMPTY_CARGO_ARRIVAL_TABLE_STATE)
  })
})
