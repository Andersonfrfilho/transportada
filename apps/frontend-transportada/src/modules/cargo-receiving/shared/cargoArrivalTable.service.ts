/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CargoArrivalFilters,
  CargoArrivalOrder,
  CargoArrivalStatus,
} from './cargoArrival.types'
import { CARGO_ARRIVAL_STATUSES } from './cargoReceiving.constant'

/** As quatro colunas que o servidor ordena; notas e progresso são contagens que ele não indexa. */
export type CargoArrivalSortColumn = 'arrivedAt' | 'contractor' | 'dueAt' | 'status'
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

const SERVER_SORT: Readonly<Record<CargoArrivalSortColumn, CargoArrivalOrder['sort']>> = {
  arrivedAt: 'arrivedAt',
  contractor: 'contractorName',
  dueAt: 'separationDueAt',
  status: 'status',
}
const LIST_SEPARATOR = ','

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
 * Filtro e ordem vão inteiros ao servidor: ele é quem enxerga a lista toda, e o cliente só tem as páginas
 * já carregadas (`web.md` §7). Sem ordenação não vai `order`, e o servidor responde `arrivedAt desc`.
 */
export function resolveServerFilters(state: CargoArrivalTableState): CargoArrivalFilters {
  return {
    contractorIds: state.contractorIds,
    order:
      state.sort === null
        ? undefined
        : { direction: state.sort.direction, sort: SERVER_SORT[state.sort.column] },
    statuses: state.statuses,
  }
}

function isStatus(value: string): value is CargoArrivalStatus {
  return CARGO_ARRIVAL_STATUSES.some((status) => status === value)
}

function isSortColumn(value: string | null): value is CargoArrivalSortColumn {
  return value !== null && Object.hasOwn(SERVER_SORT, value)
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
