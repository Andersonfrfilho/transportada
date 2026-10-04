/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4 (`web.md` §7): a tabela da lista de prévias — ordenação asc → desc → neutro, filtros de
 * seleção múltipla, "limpar filtros" só com critério, o estado inteiro na URL e o que vai ao servidor.
 */
import { describe, expect, test } from 'bun:test'

import {
  applyCargoPreviewTable,
  EMPTY_CARGO_PREVIEW_TABLE_STATE,
  hasCargoPreviewTableCriteria,
  parseCargoPreviewTableState,
  resolveCargoPreviewServerFilters,
  serializeCargoPreviewTableState,
  toggleCargoPreviewSort,
} from '@/modules/cargo-receiving/shared/cargoPreviewTable.service'

import { ALFA_ID, BETA_ID } from '../fixtures/cargoReceiving.fixture'
import {
  buildPreviewSummary,
  PREVIEW_SECOND_ID,
  PREVIEW_THIRD_ID,
} from '../fixtures/cargoPreview.fixture'

const FIRST = buildPreviewSummary({ receivedAt: '2026-10-03T14:06:00.000Z', rowCount: 7 })
const SECOND = buildPreviewSummary({
  contractorId: BETA_ID,
  contractorName: 'Beta Comércio Fictício',
  fileName: 'BETA-01-10.xlsx',
  id: PREVIEW_SECOND_ID,
  plannedDate: null,
  receivedAt: '2026-10-01T10:00:00.000Z',
  rowCount: 40,
  status: 'queued',
})
const THIRD = buildPreviewSummary({
  fileName: 'FR-28-09.xlsm',
  id: PREVIEW_THIRD_ID,
  plannedDate: '2026-09-28',
  receivedAt: '2026-09-25T19:33:00.000Z',
  rowCount: 107,
  status: 'failed',
})
const PREVIEWS = [FIRST, SECOND, THIRD]

const names = (previews: readonly (typeof FIRST)[]) => previews.map((preview) => preview.fileName)

describe('a ordenação por cabeçalho', () => {
  test('alterna ascendente, descendente e neutro; outro cabeçalho recomeça em ascendente', () => {
    const asc = toggleCargoPreviewSort({ column: 'fileName', current: null })
    const desc = toggleCargoPreviewSort({ column: 'fileName', current: asc })

    expect(asc).toEqual({ column: 'fileName', direction: 'asc' })
    expect(desc).toEqual({ column: 'fileName', direction: 'desc' })
    expect(toggleCargoPreviewSort({ column: 'fileName', current: desc })).toBeNull()
    expect(toggleCargoPreviewSort({ column: 'rowCount', current: desc })).toEqual({
      column: 'rowCount',
      direction: 'asc',
    })
  })

  test('ordena por nome, linhas e recebida em, nos dois sentidos', () => {
    const sorted = (
      column: Parameters<typeof toggleCargoPreviewSort>[0]['column'],
      direction: 'asc' | 'desc',
    ) =>
      names(
        applyCargoPreviewTable({
          previews: PREVIEWS,
          state: { ...EMPTY_CARGO_PREVIEW_TABLE_STATE, sort: { column, direction } },
        }),
      )

    expect(sorted('fileName', 'asc')).toEqual(['BETA-01-10.xlsx', 'FR-05-10.xlsm', 'FR-28-09.xlsm'])
    expect(sorted('rowCount', 'desc')).toEqual([
      'FR-28-09.xlsm',
      'BETA-01-10.xlsx',
      'FR-05-10.xlsm',
    ])
    expect(sorted('receivedAt', 'asc')).toEqual([
      'FR-28-09.xlsm',
      'BETA-01-10.xlsx',
      'FR-05-10.xlsm',
    ])
  })

  test('sem dia planejado vai por último nos dois sentidos', () => {
    const state = (direction: 'asc' | 'desc') => ({
      ...EMPTY_CARGO_PREVIEW_TABLE_STATE,
      sort: { column: 'plannedDate' as const, direction },
    })

    expect(applyCargoPreviewTable({ previews: PREVIEWS, state: state('asc') }).at(-1)?.id).toBe(
      PREVIEW_SECOND_ID,
    )
    expect(applyCargoPreviewTable({ previews: PREVIEWS, state: state('desc') }).at(-1)?.id).toBe(
      PREVIEW_SECOND_ID,
    )
  })

  test('sem ordenação mantém a ordem em que a API mandou', () => {
    expect(
      names(applyCargoPreviewTable({ previews: PREVIEWS, state: EMPTY_CARGO_PREVIEW_TABLE_STATE })),
    ).toEqual(['FR-05-10.xlsm', 'BETA-01-10.xlsx', 'FR-28-09.xlsm'])
  })
})

describe('os filtros de seleção múltipla', () => {
  test('contratante e situação aceitam vários valores; vazio é "sem filtro"', () => {
    const base = EMPTY_CARGO_PREVIEW_TABLE_STATE

    expect(
      names(
        applyCargoPreviewTable({
          previews: PREVIEWS,
          state: { ...base, contractorIds: [BETA_ID] },
        }),
      ),
    ).toEqual(['BETA-01-10.xlsx'])
    expect(
      names(
        applyCargoPreviewTable({
          previews: PREVIEWS,
          state: { ...base, statuses: ['queued', 'failed'] },
        }),
      ),
    ).toEqual(['BETA-01-10.xlsx', 'FR-28-09.xlsm'])
    expect(
      names(
        applyCargoPreviewTable({
          previews: PREVIEWS,
          state: { ...base, contractorIds: [ALFA_ID, BETA_ID], statuses: [] },
        }),
      ),
    ).toHaveLength(3)
  })

  test('com UM valor o filtro vai ao servidor; com vários o cliente filtra o que veio', () => {
    const base = EMPTY_CARGO_PREVIEW_TABLE_STATE

    expect(resolveCargoPreviewServerFilters(base)).toEqual({})
    expect(
      resolveCargoPreviewServerFilters({ ...base, contractorIds: [ALFA_ID], statuses: ['ready'] }),
    ).toEqual({ contractorId: ALFA_ID, status: 'ready' })
    expect(
      resolveCargoPreviewServerFilters({
        ...base,
        contractorIds: [ALFA_ID, BETA_ID],
        statuses: ['ready', 'failed'],
      }),
    ).toEqual({})
  })

  test('"limpar filtros" só existe com filtro ou ordenação aplicados', () => {
    const base = EMPTY_CARGO_PREVIEW_TABLE_STATE

    expect(hasCargoPreviewTableCriteria(base)).toBe(false)
    expect(hasCargoPreviewTableCriteria({ ...base, statuses: ['ready'] })).toBe(true)
    expect(hasCargoPreviewTableCriteria({ ...base, contractorIds: [ALFA_ID] })).toBe(true)
    expect(
      hasCargoPreviewTableCriteria({ ...base, sort: { column: 'status', direction: 'asc' } }),
    ).toBe(true)
  })
})

describe('o estado na URL', () => {
  test('o estado inteiro vai e volta pela URL', () => {
    const state = {
      contractorIds: [ALFA_ID, BETA_ID],
      sort: { column: 'receivedAt' as const, direction: 'desc' as const },
      statuses: ['ready', 'queued'] as const,
    }

    const search = serializeCargoPreviewTableState({ search: '', state })

    expect(new URLSearchParams(search).get('contractor')).toBe(`${ALFA_ID},${BETA_ID}`)
    expect(new URLSearchParams(search).get('status')).toBe('ready,queued')
    expect(new URLSearchParams(search).get('sort')).toBe('receivedAt')
    expect(new URLSearchParams(search).get('dir')).toBe('desc')
    expect(parseCargoPreviewTableState(search)).toEqual(state)
  })

  test('estado vazio devolve a URL sem parâmetro algum e preserva o que é de outro dono', () => {
    expect(
      serializeCargoPreviewTableState({ search: '', state: EMPTY_CARGO_PREVIEW_TABLE_STATE }),
    ).toBe('')
    expect(
      serializeCargoPreviewTableState({
        search: '?outro=1&status=ready',
        state: EMPTY_CARGO_PREVIEW_TABLE_STATE,
      }),
    ).toBe('?outro=1')
  })

  test('URL inventada não quebra a tela: valor desconhecido é ignorado, nunca recusado', () => {
    const parsed = parseCargoPreviewTableState(
      '?status=ready,voando&sort=xpto&dir=sideways&contractor=,',
    )

    expect(parsed).toEqual({ contractorIds: [], sort: null, statuses: ['ready'] })
  })
})
