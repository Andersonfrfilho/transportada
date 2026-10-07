/* Copyright (c) 2026 Ada Technology. MIT License. */
import { BRAZILIAN_STATES, HOLIDAY_KINDS, HOLIDAY_RECURRENCES } from './businessCalendar.constant'
import type { HolidayKind, HolidayRecurrence } from './businessCalendar.types'
import type { HolidayRow } from './businessCalendarRows.service'

export type HolidaySortColumn = 'date' | 'kind' | 'name' | 'place'
export type HolidaySortDirection = 'asc' | 'desc'
export type HolidaySort = Readonly<{ column: HolidaySortColumn; direction: HolidaySortDirection }>

export type HolidayTableState = Readonly<{
  kinds: readonly HolidayKind[]
  page: number
  recurrences: readonly HolidayRecurrence[]
  sort: HolidaySort | null
  states: readonly string[]
}>

export const EMPTY_HOLIDAY_TABLE_STATE: HolidayTableState = {
  kinds: [],
  page: 1,
  recurrences: [],
  sort: null,
  states: [],
}

export const HOLIDAY_PAGE_SIZE = 10

const SORT_COLUMNS: readonly HolidaySortColumn[] = ['date', 'kind', 'name', 'place']
const LIST_SEPARATOR = ','
const FIRST_PAGE = 1

/** asc → desc → neutro no mesmo cabeçalho; outro cabeçalho recomeça em asc (`web.md` §7). */
export function toggleHolidaySort(
  input: Readonly<{ column: HolidaySortColumn; current: HolidaySort | null }>,
): HolidaySort | null {
  if (input.current?.column !== input.column) return { column: input.column, direction: 'asc' }
  return input.current.direction === 'asc' ? { column: input.column, direction: 'desc' } : null
}

/** A página não é critério: "limpar filtros" só existe com filtro ou ordenação. */
export function hasHolidayTableCriteria(state: HolidayTableState): boolean {
  return (
    state.kinds.length > 0 ||
    state.recurrences.length > 0 ||
    state.states.length > 0 ||
    state.sort !== null
  )
}

function matchesFilters(input: Readonly<{ row: HolidayRow; state: HolidayTableState }>): boolean {
  const { row, state } = input
  return (
    (state.kinds.length === 0 || state.kinds.includes(row.kind)) &&
    (state.recurrences.length === 0 || state.recurrences.includes(row.recurrence)) &&
    (state.states.length === 0 || state.states.includes(row.stateIbgeCode))
  )
}

function sortValueOf(input: Readonly<{ column: HolidaySortColumn; row: HolidayRow }>): string {
  const { column, row } = input
  if (column === 'date') return row.dateKey
  if (column === 'kind') return row.kind
  return column === 'name' ? row.name : row.placeLabel
}

function sortRows(
  input: Readonly<{ rows: readonly HolidayRow[]; sort: HolidaySort | null }>,
): readonly HolidayRow[] {
  const { rows, sort } = input
  if (sort === null) return rows
  const sign = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort(
    (left, right) =>
      sign *
      sortValueOf({ column: sort.column, row: left }).localeCompare(
        sortValueOf({ column: sort.column, row: right }),
        'pt-BR',
        { numeric: true, sensitivity: 'base' },
      ),
  )
}

export type HolidayTableView = Readonly<{
  page: number
  pageCount: number
  rows: readonly HolidayRow[]
  total: number
}>

/** Filtra, ordena e fatia: a página pedida além do fim volta para a última. */
export function applyHolidayTable(
  input: Readonly<{ rows: readonly HolidayRow[]; state: HolidayTableState }>,
): HolidayTableView {
  const { rows, state } = input
  const matching = sortRows({
    rows: rows.filter((row) => matchesFilters({ row, state })),
    sort: state.sort,
  })
  const pageCount = Math.max(1, Math.ceil(matching.length / HOLIDAY_PAGE_SIZE))
  const page = Math.min(Math.max(state.page, FIRST_PAGE), pageCount)
  const start = (page - 1) * HOLIDAY_PAGE_SIZE
  return {
    page,
    pageCount,
    rows: matching.slice(start, start + HOLIDAY_PAGE_SIZE),
    total: matching.length,
  }
}

type UrlInput = Readonly<{ prefix: string; search: string }>

function readList<TValue extends string>(
  input: Readonly<{ accepts: (value: string) => value is TValue; raw: string | null }>,
): readonly TValue[] {
  const values = (input.raw ?? '').split(LIST_SEPARATOR).filter(input.accepts)
  return [...new Set(values)]
}

export function isHolidayKind(value: string): value is HolidayKind {
  return HOLIDAY_KINDS.some((kind) => kind === value)
}

export function isHolidayRecurrence(value: string): value is HolidayRecurrence {
  return HOLIDAY_RECURRENCES.some((recurrence) => recurrence === value)
}

function isStateCode(value: string): boolean {
  return BRAZILIAN_STATES.some((state) => state.code === value)
}

function isSortColumn(value: string | null): value is HolidaySortColumn {
  return SORT_COLUMNS.some((column) => column === value)
}

function readPage(raw: string | null): number {
  const page = Number(raw)
  return Number.isInteger(page) && page >= FIRST_PAGE ? page : FIRST_PAGE
}

/** URL inventada não quebra a tela: valor desconhecido é ignorado, nunca recusado. */
export function parseHolidayTableState(input: UrlInput): HolidayTableState {
  const parameters = new URLSearchParams(input.search)
  const read = (name: string) => parameters.get(`${input.prefix}${name}`)
  const column = read('Sort')
  return {
    kinds: readList({ accepts: isHolidayKind, raw: read('Kind') }),
    page: readPage(read('Page')),
    recurrences: readList({ accepts: isHolidayRecurrence, raw: read('Recurrence') }),
    sort: isSortColumn(column)
      ? { column, direction: read('Dir') === 'desc' ? 'desc' : 'asc' }
      : null,
    states: readList({
      accepts: (value): value is string => isStateCode(value),
      raw: read('State'),
    }),
  }
}

/** Devolve o `search` completo: o que é de outro dono (a aba, a outra tabela) fica; só os desta tabela mudam. */
export function serializeHolidayTableState(input: UrlInput & { state: HolidayTableState }): string {
  const parameters = new URLSearchParams(input.search)
  const write = (name: string, value: string) => {
    const key = `${input.prefix}${name}`
    if (value === '') parameters.delete(key)
    else parameters.set(key, value)
  }
  const { kinds, page, recurrences, sort, states } = input.state
  write('Kind', kinds.join(LIST_SEPARATOR))
  write('Recurrence', recurrences.join(LIST_SEPARATOR))
  write('State', states.join(LIST_SEPARATOR))
  write('Sort', sort?.column ?? '')
  write('Dir', sort?.direction ?? '')
  write('Page', page === FIRST_PAGE ? '' : String(page))
  const serialized = parameters.toString()
  return serialized === '' ? '' : `?${serialized}`
}
