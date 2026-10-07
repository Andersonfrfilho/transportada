/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4: o detalhe da prévia — grupos por roteiro (na ordem da API, "sem roteiro" por último),
 * filtros por estado e por roteiro (um valor vai ao servidor, vários o cliente aplica), o estado na URL, e as
 * ações que cada item oferece (confirmar só a sugestão, desvincular só a vinculada, vincular à mão o que
 * espera, nada na linha inválida e nada sem `trip.manage`).
 */
import { describe, expect, test } from 'bun:test'

import {
  applyCargoPreviewItemFilters,
  buildCargoPreviewRouteSections,
  EMPTY_CARGO_PREVIEW_DETAIL_FILTERS,
  hasCargoPreviewDetailFilters,
  parseCargoPreviewDetailFilters,
  resolveCargoPreviewItemServerFilters,
  serializeCargoPreviewDetailFilters,
} from '@/modules/cargo-receiving/shared/cargoPreviewDetailView.service'
import {
  countLinkedGroupRows,
  resolveCargoPreviewItemActions,
  resolveRowErrorKey,
} from '@/modules/cargo-receiving/shared/cargoPreviewItemActions.service'

import {
  buildPreviewItem,
  buildRouteGroups,
  DEFAULT_PREVIEW_ITEMS,
  linkedDocument,
} from '../fixtures/cargoPreview.fixture'

const item = (row: number) => DEFAULT_PREVIEW_ITEMS[row - 1] ?? buildPreviewItem(row)

describe('os grupos por roteiro', () => {
  test('um grupo por roteiro na ordem da API, com a carga ligada, e "sem roteiro" por último', () => {
    const sections = buildCargoPreviewRouteSections({
      items: DEFAULT_PREVIEW_ITEMS,
      routes: buildRouteGroups(DEFAULT_PREVIEW_ITEMS),
    })

    expect(sections.map((section) => section.routeName)).toEqual(['FR.R.LIM', 'FR.S.CAR', null])
    expect(sections.map((section) => section.items.map((entry) => entry.rowNumber))).toEqual([
      [8, 9, 10],
      [5, 6, 7],
      [11],
    ])
    expect(sections[1]?.group?.loadReference).toBe('CARGA-9001')
    expect(sections[0]?.group?.loadReference).toBeNull()
    expect(sections[2]?.group).toBeUndefined()
  })

  test('o roteiro sem item carregado não vira grupo vazio', () => {
    const sections = buildCargoPreviewRouteSections({
      items: [item(1)],
      routes: buildRouteGroups(DEFAULT_PREVIEW_ITEMS),
    })

    expect(sections.map((section) => section.routeName)).toEqual(['FR.S.CAR'])
  })

  test('as linhas de um roteiro ficam na ordem da planilha', () => {
    const sections = buildCargoPreviewRouteSections({
      items: [item(3), item(1), item(2)],
      routes: buildRouteGroups(DEFAULT_PREVIEW_ITEMS),
    })

    expect(sections.flatMap((section) => section.items.map((entry) => entry.rowNumber))).toEqual([
      5, 6, 7,
    ])
  })
})

describe('os filtros do detalhe', () => {
  const state = (filters: Partial<typeof EMPTY_CARGO_PREVIEW_DETAIL_FILTERS>) => ({
    ...EMPTY_CARGO_PREVIEW_DETAIL_FILTERS,
    ...filters,
  })

  test('estado e roteiro aceitam vários; vazio é "sem filtro"', () => {
    const rowsOf = (filters: ReturnType<typeof state>) =>
      applyCargoPreviewItemFilters({ filters, items: DEFAULT_PREVIEW_ITEMS }).map(
        (entry) => entry.rowNumber,
      )

    expect(rowsOf(state({}))).toHaveLength(7)
    expect(rowsOf(state({ states: ['matched', 'invalid'] }))).toEqual([5, 9, 10])
    expect(rowsOf(state({ routeNames: ['FR.R.LIM'] }))).toEqual([8, 9, 10])
    expect(rowsOf(state({ routeNames: ['FR.R.LIM'], states: ['matched'] }))).toEqual([10])
  })

  test('com UM valor o filtro vai ao servidor; com vários o cliente filtra o que veio', () => {
    expect(resolveCargoPreviewItemServerFilters(state({}))).toEqual({})
    expect(
      resolveCargoPreviewItemServerFilters(
        state({ routeNames: ['FR.S.CAR'], states: ['matched'] }),
      ),
    ).toEqual({ routeName: 'FR.S.CAR', state: 'matched' })
    expect(
      resolveCargoPreviewItemServerFilters(
        state({ routeNames: ['FR.S.CAR', 'FR.R.LIM'], states: ['matched', 'invalid'] }),
      ),
    ).toEqual({})
  })

  test('o estado vai e volta pela URL, o desconhecido é ignorado e "limpar" só existe com filtro', () => {
    const filters = state({
      routeNames: ['FR.S.CAR', 'FR.R.LIM'],
      states: ['awaiting_xml', 'invalid'],
    })

    const search = serializeCargoPreviewDetailFilters({ filters, search: '' })

    expect(new URLSearchParams(search).get('state')).toBe('awaiting_xml,invalid')
    expect(new URLSearchParams(search).get('route')).toBe('FR.S.CAR,FR.R.LIM')
    expect(parseCargoPreviewDetailFilters(search)).toEqual(filters)
    expect(parseCargoPreviewDetailFilters('?state=voando,matched')).toEqual(
      state({ states: ['matched'] }),
    )
    expect(
      serializeCargoPreviewDetailFilters({ filters: state({}), search: '?x=1&state=matched' }),
    ).toBe('?x=1')
    expect(hasCargoPreviewDetailFilters(state({}))).toBe(false)
    expect(hasCargoPreviewDetailFilters(filters)).toBe(true)
  })
})

describe('as ações de cada item', () => {
  const actions = (row: number, canManage = true) =>
    resolveCargoPreviewItemActions({ canManage, item: item(row) })

  test('sugerida confirma ou vincula à mão; vinculada desvincula; esperando e ambígua vinculam', () => {
    expect(actions(3)).toEqual(['confirm', 'link'])
    expect(actions(1)).toEqual(['unlink'])
    expect(actions(6)).toEqual(['unlink'])
    expect(actions(2)).toEqual(['link'])
    expect(actions(4)).toEqual(['link'])
  })

  test('a linha inválida não oferece ação alguma: não há o que decidir', () => {
    expect(actions(5)).toEqual([])
  })

  test('sem trip.manage nenhuma ação aparece, em nenhum estado', () => {
    for (const row of [1, 2, 3, 4, 5, 6]) expect(actions(row, false)).toEqual([])
  })

  test('desvincular age no grupo: conta as linhas que fecham a mesma nota', () => {
    const sameNote = [
      buildPreviewItem(1, {
        document: linkedDocument(52_001, '1.00'),
        matchGroupKey: 'g',
        matchState: 'matched',
      }),
      buildPreviewItem(2, {
        document: linkedDocument(52_001, '1.00'),
        matchGroupKey: 'g',
        matchState: 'matched',
      }),
      buildPreviewItem(3, { matchGroupKey: 'outro', matchState: 'matched' }),
      buildPreviewItem(4),
    ]

    expect(countLinkedGroupRows({ item: sameNote[0] ?? item(1), items: sameNote })).toBe(2)
    expect(countLinkedGroupRows({ item: sameNote[3] ?? item(4), items: sameNote })).toBe(1)
  })
})

describe('o motivo do erro de linha', () => {
  test('traduz as mensagens do leitor e deixa o resto sair cru', () => {
    expect(resolveRowErrorKey('A value is required')).toBe('required')
    expect(resolveRowErrorKey('Must be a non-negative decimal number')).toBe('decimal')
    expect(resolveRowErrorKey('Alguma mensagem nova')).toBeUndefined()
  })
})
