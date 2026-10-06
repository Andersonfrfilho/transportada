/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CargoArrivalFilters,
  CargoArrivalStatus,
  CargoArrivalSummary,
} from './cargoArrival.types'
import { CARGO_ARRIVAL_STATUSES } from './cargoReceiving.constant'

export type CargoArrivalSortColumn =
  | 'arrivedAt'
  | 'contractor'
  | 'documents'
  | 'dueAt'
  | 'progress'
  | 'status'
export type CargoArrivalSortDirection = 'asc' | 'desc'
export type CargoArrivalSort = Readonly<{
  column: CargoArrivalSortColumn
  direction: CargoArrivalSortDirection
}>

export type CargoArrivalTableState = Readonly<{
  contractorIds: readonly string[]
  sort: CargoArrivalSort | null
  statuses: readonly CargoArrivalStatus[]
}>

export const EMPTY_CARGO_ARRIVAL_TABLE_STATE: CargoArrivalTableState = {
  contractorIds: [],
  sort: null,
  statuses: [],
}

const SORT_COLUMNS: readonly CargoArrivalSortColumn[] = [
  'arrivedAt',
  'contractor',
  'documents',
  'dueAt',
  'progress',
  'status',
]
const LIST_SEPARATOR = ','
const STATUS_ORDER: Readonly<Record<CargoArrivalStatus, number>> = { open: 0, closed: 1 }

/** asc → desc → neutro no mesmo cabeçalho; outro cabeçalho recomeça em asc (`web.md` §7). */
export function toggleCargoArrivalSort(
  input: Readonly<{ column: CargoArrivalSortColumn; current: CargoArrivalSort | null }>,
): CargoArrivalSort | null {
  if (input.current?.column !== input.column) return { column: input.column, direction: 'asc' }
  if (input.current.direction === 'asc') return { column: input.column, direction: 'desc' }
  return null
}

export function hasCargoArrivalTableCriteria(state: CargoArrivalTableState): boolean {
  return state.contractorIds.length > 0 || state.statuses.length > 0 || state.sort !== null
}

/**
 * A API filtra por UM contratante e UMA situação. Com um valor só o filtro vai ao servidor (a lista
 * carregada já vem certa); com vários, o servidor devolve tudo e o cliente filtra o que veio.
 */
export function resolveServerFilters(state: CargoArrivalTableState): CargoArrivalFilters {
  const [contractorId] = state.contractorIds
  const [status] = state.statuses
  return {
    ...(state.contractorIds.length === 1 && contractorId !== undefined ? { contractorId } : {}),
    ...(state.statuses.length === 1 && status !== undefined ? { status } : {}),
  }
}

function ratioOf(arrival: CargoArrivalSummary): number {
  return arrival.counts.total === 0 ? 0 : arrival.counts.separated / arrival.counts.total
}

function compareValues(left: number | string, right: number | string): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), 'pt-BR', { sensitivity: 'base' })
}

function readSortValue(
  input: Readonly<{ arrival: CargoArrivalSummary; column: CargoArrivalSortColumn }>,
): number | string | null {
  const { arrival } = input
  switch (input.column) {
    case 'arrivedAt':
      return new Date(arrival.arrivedAt).getTime()
    case 'contractor':
      return arrival.contractorName
    case 'documents':
      return arrival.counts.total
    case 'dueAt':
      return arrival.separationDueAt === null ? null : new Date(arrival.separationDueAt).getTime()
    case 'progress':
      return ratioOf(arrival)
    case 'status':
      return STATUS_ORDER[arrival.status]
  }
}

/** Sem prazo vai por último nos dois sentidos: "sem prazo" não é o prazo mais curto nem o mais longo. */
function compareArrivals(
  input: Readonly<{
    left: CargoArrivalSummary
    right: CargoArrivalSummary
    sort: CargoArrivalSort
  }>,
): number {
  const left = readSortValue({ arrival: input.left, column: input.sort.column })
  const right = readSortValue({ arrival: input.right, column: input.sort.column })
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1
  const order = compareValues(left, right)
  return input.sort.direction === 'asc' ? order : -order
}

/** Seleção vazia é "sem filtro": esconder tudo por não ter marcado nada seria o defeito. */
export function applyCargoArrivalTable(
  input: Readonly<{ arrivals: readonly CargoArrivalSummary[]; state: CargoArrivalTableState }>,
): readonly CargoArrivalSummary[] {
  const { contractorIds, sort, statuses } = input.state
  const filtered = input.arrivals.filter(
    (arrival) =>
      (contractorIds.length === 0 || contractorIds.includes(arrival.contractorId)) &&
      (statuses.length === 0 || statuses.includes(arrival.status)),
  )
  if (sort === null) return filtered
  return [...filtered].sort((left, right) => compareArrivals({ left, right, sort }))
}

function isStatus(value: string): value is CargoArrivalStatus {
  return CARGO_ARRIVAL_STATUSES.some((status) => status === value)
}

function isSortColumn(value: string | null): value is CargoArrivalSortColumn {
  return SORT_COLUMNS.some((column) => column === value)
}

function readList(value: string | null): string[] {
  return (value ?? '').split(LIST_SEPARATOR).filter((item) => item !== '')
}

/** URL inventada não quebra a tela: valor desconhecido é ignorado, nunca recusado. */
export function parseCargoArrivalTableState(search: string): CargoArrivalTableState {
  const parameters = new URLSearchParams(search)
  const column = parameters.get('sort')
  return {
    contractorIds: [...new Set(readList(parameters.get('contractor')))],
    sort: isSortColumn(column)
      ? { column, direction: parameters.get('dir') === 'desc' ? 'desc' : 'asc' }
      : null,
    statuses: [...new Set(readList(parameters.get('status')).filter(isStatus))],
  }
}

function writeOptional(
  input: Readonly<{ name: string; parameters: URLSearchParams; value: string }>,
): void {
  if (input.value === '') input.parameters.delete(input.name)
  else input.parameters.set(input.name, input.value)
}

/** Devolve o `search` completo: o que é de outro dono fica; só os parâmetros desta lista mudam. */
export function serializeCargoArrivalTableState(
  input: Readonly<{ search: string; state: CargoArrivalTableState }>,
): string {
  const parameters = new URLSearchParams(input.search)
  const { contractorIds, sort, statuses } = input.state
  writeOptional({ name: 'contractor', parameters, value: contractorIds.join(LIST_SEPARATOR) })
  writeOptional({ name: 'status', parameters, value: statuses.join(LIST_SEPARATOR) })
  writeOptional({ name: 'sort', parameters, value: sort?.column ?? '' })
  writeOptional({ name: 'dir', parameters, value: sort?.direction ?? '' })
  const serialized = parameters.toString()
  return serialized === '' ? '' : `?${serialized}`
}
