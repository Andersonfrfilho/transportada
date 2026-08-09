/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Trip, TripFilters } from './trip.types'

/** ADR-0024: 4 colunas, sem coluna gerenciável nem ordenação de servidor — ordena só a página
 * corrente, trazida pelo cursor. */
export const TRIP_COLUMN_KEYS = ['vehicleId', 'status', 'createdAt', 'updatedAt'] as const
export type TripColumnKey = (typeof TRIP_COLUMN_KEYS)[number]

export type TripSortState = null | Readonly<{ column: TripColumnKey; direction: 'asc' | 'desc' }>

export type TripPageState = Readonly<{
  cursor: null | string
  history: readonly (null | string)[]
}>

export const TRIP_FIRST_PAGE: TripPageState = { cursor: null, history: [] }

export function countActiveTripFilters(filters: TripFilters): number {
  return Object.values(filters).filter((value) => value !== undefined && value !== '').length
}

export function nextTripSortState(current: TripSortState, column: TripColumnKey): TripSortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

function columnValue(row: Trip, column: TripColumnKey): string {
  return row[column]
}

function compareColumn(column: TripColumnKey, left: Trip, right: Trip): number {
  return columnValue(left, column).localeCompare(columnValue(right, column), 'pt-BR')
}

export function sortTrips(items: readonly Trip[], sort: TripSortState): readonly Trip[] {
  if (sort === null) return items
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...items].sort((left, right) => compareColumn(sort.column, left, right) * factor)
}

export function nextTripPage(state: TripPageState, nextCursor: null | string): TripPageState {
  if (nextCursor === null) return state
  return { cursor: nextCursor, history: [...state.history, state.cursor] }
}

export function previousTripPage(state: TripPageState): TripPageState {
  const previousCursor = state.history.at(-1)
  if (previousCursor === undefined) return TRIP_FIRST_PAGE
  return { cursor: previousCursor, history: state.history.slice(0, -1) }
}

export function canGoToPreviousTripPage(state: TripPageState): boolean {
  return state.history.length > 0
}
