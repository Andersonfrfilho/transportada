/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Trip, TripFilters } from './trip.types'

/**
 * ADR-0024: sem coluna gerenciável nem ordenação de servidor — ordena só a página corrente, trazida
 * pelo cursor.
 *
 * `cargoValue` e `revenue` entraram depois: quanto a carga vale e quanto ela rende, lado a lado.
 * Elas ficam **entre** o veículo e as datas de propósito — quem varre a lista procura dinheiro perto
 * de quem carrega, não no fim da linha.
 */
export const TRIP_COLUMN_KEYS = [
  'vehicleId',
  'status',
  'cargoValue',
  'revenue',
  'createdAt',
  'updatedAt',
] as const
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

/**
 * ⚠️ **Dinheiro não se ordena por texto.** `'900,00'` vem depois de `'1.000,00'` no alfabeto, e a
 * coluna diria que a viagem menor é a maior. A comparação é numérica, e o desconhecido vai para o
 * fim nos dois sentidos — ausência não é o menor valor, é a falta dele.
 */
const MONEY_COLUMNS = new Set<TripColumnKey>(['cargoValue', 'revenue'])

function moneyValue(row: Trip, column: TripColumnKey): null | number {
  const amount =
    column === 'cargoValue'
      ? (row.amounts?.documentsTotal ?? null)
      : (row.amounts?.revenueTotal ?? null)
  if (amount === null) return null
  const parsed = Number(amount)

  return Number.isFinite(parsed) ? parsed : null
}

function compareMoney(column: TripColumnKey, left: Trip, right: Trip): number {
  const leftValue = moneyValue(left, column)
  const rightValue = moneyValue(right, column)
  if (leftValue === null) return rightValue === null ? 0 : 1
  if (rightValue === null) return -1

  return leftValue - rightValue
}

function columnValue(row: Trip, column: TripColumnKey): string {
  return column === 'vehicleId' ||
    column === 'status' ||
    column === 'createdAt' ||
    column === 'updatedAt'
    ? row[column]
    : ''
}

function compareColumn(column: TripColumnKey, left: Trip, right: Trip): number {
  if (MONEY_COLUMNS.has(column)) return compareMoney(column, left, right)

  return columnValue(left, column).localeCompare(columnValue(right, column), 'pt-BR')
}

export function sortTrips(items: readonly Trip[], sort: TripSortState): readonly Trip[] {
  if (sort === null) return items
  const factor = sort.direction === 'asc' ? 1 : -1

  /** A ausência fica no fim **nos dois sentidos**: inverter a lista não pode promovê-la ao topo. */
  return [...items].sort((left, right) => {
    if (MONEY_COLUMNS.has(sort.column)) {
      const leftValue = moneyValue(left, sort.column)
      const rightValue = moneyValue(right, sort.column)
      if (leftValue === null || rightValue === null) return compareMoney(sort.column, left, right)
    }

    return compareColumn(sort.column, left, right) * factor
  })
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
