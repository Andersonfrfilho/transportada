/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CARGO_PREVIEW_STATUSES } from './cargoPreview.constant'
import type {
  CargoPreviewListFilters,
  CargoPreviewStatus,
  CargoPreviewSummary,
} from './cargoPreview.types'
import {
  compareSortValues,
  readUrlList,
  toggleCargoSort,
  writeUrlList,
  type CargoSort,
} from './cargoTableSort.service'

export type CargoPreviewSortColumn =
  | 'contractor'
  | 'fileName'
  | 'plannedDate'
  | 'receivedAt'
  | 'rowCount'
  | 'status'
export type CargoPreviewSort = CargoSort<CargoPreviewSortColumn>

export type CargoPreviewTableState = Readonly<{
  contractorIds: readonly string[]
  sort: CargoPreviewSort | null
  statuses: readonly CargoPreviewStatus[]
}>

export const EMPTY_CARGO_PREVIEW_TABLE_STATE: CargoPreviewTableState = {
  contractorIds: [],
  sort: null,
  statuses: [],
}

export const CARGO_PREVIEW_SORT_COLUMNS: readonly CargoPreviewSortColumn[] = [
  'contractor',
  'fileName',
  'receivedAt',
  'plannedDate',
  'rowCount',
  'status',
]

const STATUS_ORDER: Readonly<Record<CargoPreviewStatus, number>> = {
  queued: 0,
  processing: 1,
  ready: 2,
  failed: 3,
}

export const toggleCargoPreviewSort = (
  input: Readonly<{ column: CargoPreviewSortColumn; current: CargoPreviewSort | null }>,
): CargoPreviewSort | null => toggleCargoSort(input)

export function hasCargoPreviewTableCriteria(state: CargoPreviewTableState): boolean {
  return state.contractorIds.length > 0 || state.statuses.length > 0 || state.sort !== null
}

/**
 * A API filtra por UM contratante e UMA situação. Com um valor só o filtro vai ao servidor (a lista
 * carregada já vem certa); com vários, o servidor devolve tudo e o cliente filtra o que veio.
 */
export function resolveCargoPreviewServerFilters(
  state: CargoPreviewTableState,
): CargoPreviewListFilters {
  const [contractorId] = state.contractorIds
  const [status] = state.statuses
  return {
    ...(state.contractorIds.length === 1 && contractorId !== undefined ? { contractorId } : {}),
    ...(state.statuses.length === 1 && status !== undefined ? { status } : {}),
  }
}

function readSortValue(
  input: Readonly<{ column: CargoPreviewSortColumn; preview: CargoPreviewSummary }>,
): number | string | null {
  const { preview } = input
  switch (input.column) {
    case 'contractor':
      return preview.contractorName
    case 'fileName':
      return preview.fileName
    case 'plannedDate':
      return preview.plannedDate
    case 'receivedAt':
      return new Date(preview.receivedAt).getTime()
    case 'rowCount':
      return preview.rowCount
    case 'status':
      return STATUS_ORDER[preview.status]
  }
}

/** Seleção vazia é "sem filtro": esconder tudo por não ter marcado nada seria o defeito. */
export function applyCargoPreviewTable(
  input: Readonly<{ previews: readonly CargoPreviewSummary[]; state: CargoPreviewTableState }>,
): readonly CargoPreviewSummary[] {
  const { contractorIds, sort, statuses } = input.state
  const filtered = input.previews.filter(
    (preview) =>
      (contractorIds.length === 0 || contractorIds.includes(preview.contractorId)) &&
      (statuses.length === 0 || statuses.includes(preview.status)),
  )
  if (sort === null) return filtered
  return [...filtered].sort((left, right) =>
    compareSortValues({
      direction: sort.direction,
      left: readSortValue({ column: sort.column, preview: left }),
      right: readSortValue({ column: sort.column, preview: right }),
    }),
  )
}

function isStatus(value: string): value is CargoPreviewStatus {
  return CARGO_PREVIEW_STATUSES.some((status) => status === value)
}

function isSortColumn(value: string | null): value is CargoPreviewSortColumn {
  return CARGO_PREVIEW_SORT_COLUMNS.some((column) => column === value)
}

/** URL inventada não quebra a tela: valor desconhecido é ignorado, nunca recusado. */
export function parseCargoPreviewTableState(search: string): CargoPreviewTableState {
  const parameters = new URLSearchParams(search)
  const column = parameters.get('sort')
  return {
    contractorIds: [...new Set(readUrlList(parameters.get('contractor')))],
    sort: isSortColumn(column)
      ? { column, direction: parameters.get('dir') === 'desc' ? 'desc' : 'asc' }
      : null,
    statuses: [...new Set(readUrlList(parameters.get('status')).filter(isStatus))],
  }
}

/** Devolve o `search` completo: o que é de outro dono fica; só os parâmetros desta lista mudam. */
export function serializeCargoPreviewTableState(
  input: Readonly<{ search: string; state: CargoPreviewTableState }>,
): string {
  const parameters = new URLSearchParams(input.search)
  const { contractorIds, sort, statuses } = input.state
  writeUrlList({ name: 'contractor', parameters, values: contractorIds })
  writeUrlList({ name: 'status', parameters, values: statuses })
  writeUrlList({ name: 'sort', parameters, values: sort === null ? [] : [sort.column] })
  writeUrlList({ name: 'dir', parameters, values: sort === null ? [] : [sort.direction] })
  const serialized = parameters.toString()
  return serialized === '' ? '' : `?${serialized}`
}
