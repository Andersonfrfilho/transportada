/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  readTableColumnPreferences,
  reorderTableColumns,
  writeTableColumnPreferences,
  type TableColumnPreferences,
  type TableColumnStorage,
} from '@/modules/shared/tableColumnPreferences.service'

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
  /** Spec 259: quanto do veículo está cheio, por peso e por volume — não ordena (sem valor único). */
  'occupancy',
  'cargoValue',
  'revenue',
  'result',
  'createdAt',
] as const
export type TripColumnKey = (typeof TRIP_COLUMN_KEYS)[number]

export type TripSortState = null | Readonly<{ column: TripColumnKey; direction: 'asc' | 'desc' }>

/**
 * A página é descrita de um de três jeitos: o cursor (`forward` lê as mais antigas que ele,
 * `backward` as mais novas) ou o `offset` do salto direto para a página N. O servidor devolve, junto
 * de cada página, os cursores dos vizinhos, a posição e o total.
 */
export type TripPageState = Readonly<{
  cursor: null | string
  direction: 'backward' | 'forward'
  offset: null | number
}>

export const TRIP_FIRST_PAGE: TripPageState = { cursor: null, direction: 'forward', offset: null }

/** Seleção vazia não é filtro: `statusIn: []` contaria como ativo e a tela diria "1 filtro". */
export function countActiveTripFilters(filters: TripFilters): number {
  return Object.values(filters).filter((value) => {
    if (Array.isArray(value)) return value.length > 0
    return value !== undefined && value !== ''
  }).length
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
const MONEY_COLUMNS = new Set<TripColumnKey>(['cargoValue', 'revenue', 'result'])

/**
 * Spec 156 L6: sem `trip.financials` a API tira `amounts` da linha, e a coluna sai junto — "sem
 * valor" ali afirmaria que a carga não tem preço, quando o que falta é a permissão. Spec 259: o
 * resultado (gasto e lucro) segue a mesma regra; a ocupação não é dinheiro e fica.
 */
export function visibleTripColumns(input: {
  readonly canReadFinancials: boolean
}): readonly TripColumnKey[] {
  if (input.canReadFinancials) return TRIP_COLUMN_KEYS
  return TRIP_COLUMN_KEYS.filter((column) => !MONEY_COLUMNS.has(column))
}

/**
 * O par que qualquer coluna de dinheiro reusa (spec 153, segunda revisão N5): string crua vira
 * número ou `null` — nunca `NaN` solto —, e a comparação joga a ausência para o fim **nos dois
 * sentidos**, porque ela não é o menor valor, é a falta dele. A tabela de NF-e reusa este par em
 * vez de duplicar a regra com `Number(undefined)`, que devolve `NaN` e embaralha o `sort`.
 */
export function parseMoneyAmount(raw: null | string | undefined): null | number {
  if (raw === null || raw === undefined) return null
  const parsed = Number(raw)

  return Number.isFinite(parsed) ? parsed : null
}

export function compareMoneyAmounts(left: null | number, right: null | number): number {
  if (left === null) return right === null ? 0 : 1
  if (right === null) return -1

  return left - right
}

function moneyValue(row: Trip, column: TripColumnKey): null | number {
  if (column === 'result') return parseMoneyAmount(row.amounts?.marginTotal)
  const amount =
    column === 'cargoValue'
      ? (row.amounts?.documentsTotal ?? null)
      : (row.amounts?.revenueTotal ?? null)
  return parseMoneyAmount(amount)
}

function compareMoney(column: TripColumnKey, left: Trip, right: Trip): number {
  return compareMoneyAmounts(moneyValue(left, column), moneyValue(right, column))
}

function columnValue(row: Trip, column: TripColumnKey): string {
  /** Spec 217: viagem `awaiting_crew` ainda sem veículo — a ausência ordena como o fim do alfabeto. */
  if (column === 'vehicleId') return row.vehicleId ?? ''
  if (column === 'status' || column === 'createdAt') return row[column]

  return ''
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
  return { cursor: nextCursor, direction: 'forward', offset: null }
}

export function previousTripPage(
  state: TripPageState,
  previousCursor: null | string,
): TripPageState {
  if (previousCursor === null) return state
  return { cursor: previousCursor, direction: 'backward', offset: null }
}

/** Há página para trás quando o servidor mandou o cursor dela — a primeira não manda. */
export function canGoToPreviousTripPage(previousCursor: null | string): boolean {
  return previousCursor !== null
}

/** Salto para a página `pageNumber` (1 é a primeira): o servidor pula `(N-1) × tamanho` viagens. */
export function tripPageAt(input: {
  readonly pageNumber: number
  readonly pageSize: number
}): TripPageState {
  if (input.pageNumber <= 1) return TRIP_FIRST_PAGE
  return {
    cursor: null,
    direction: 'forward',
    offset: (input.pageNumber - 1) * input.pageSize,
  }
}

/** Quantas páginas o total tem; sem total (API antiga) não há como contar. */
export function tripPageCount(input: {
  readonly pageSize: number
  readonly total: null | number
}): null | number {
  if (input.total === null) return null
  return Math.max(1, Math.ceil(input.total / input.pageSize))
}

/** Número (a partir de 1) da página que começa depois de `offset` viagens. */
export function tripPageNumber(input: {
  readonly offset: null | number
  readonly pageSize: number
}): number {
  if (input.offset === null) return 1
  return Math.floor(input.offset / input.pageSize) + 1
}

export type TripPageNumberItem = number | 'gap'

/**
 * Os números que cabem na tela: a primeira, a última e a vizinhança da atual, com reticências onde
 * há salto. Até sete páginas aparecem todas — esconder uma delas para mostrar "…" não economizaria nada.
 */
export function visibleTripPageNumbers(input: {
  readonly count: number
  readonly current: number
}): readonly TripPageNumberItem[] {
  const { count, current } = input
  if (count <= 7) return Array.from({ length: count }, (_unused, index) => index + 1)
  const wanted = new Set([1, count, current - 1, current, current + 1])
  const pages = [...wanted].filter((page) => page >= 1 && page <= count).sort((a, b) => a - b)
  const items: TripPageNumberItem[] = []
  for (const [index, page] of pages.entries()) {
    const before = pages[index - 1]
    if (before !== undefined && page - before === 2) items.push(before + 1)
    else if (before !== undefined && page - before > 2) items.push('gap')
    items.push(page)
  }
  return items
}

export type TripColumnPreferences = TableColumnPreferences<TripColumnKey>

/**
 * Preferência de colunas **por usuário**: o armazenamento é do navegador, e dois operadores no
 * mesmo computador não podem herdar a tela um do outro. Sem usuário resolvido ainda, a chave não
 * existe e a tela usa o padrão — nada é lido nem gravado na chave errada.
 */
export function tripColumnsStorageKey(userId: string): string {
  return `trip.trips.columns.v1.${userId}`
}

export function readTripColumnPreferences(input: {
  readonly storage: TableColumnStorage | null
  readonly userId: string | undefined
}): TripColumnPreferences {
  return readTableColumnPreferences({
    columns: TRIP_COLUMN_KEYS,
    storage: input.userId === undefined ? null : input.storage,
    storageKey: tripColumnsStorageKey(input.userId ?? ''),
  })
}

export function writeTripColumnPreferences(input: {
  readonly preferences: TripColumnPreferences
  readonly storage: TableColumnStorage | null
  readonly userId: string | undefined
}): void {
  if (input.userId === undefined) return
  writeTableColumnPreferences({
    preferences: input.preferences,
    storage: input.storage,
    storageKey: tripColumnsStorageKey(input.userId),
  })
}

export function reorderTripColumns(
  order: readonly TripColumnKey[],
  column: TripColumnKey,
  direction: 'down' | 'up',
): readonly TripColumnKey[] {
  return reorderTableColumns(order, column, direction)
}

/** A ordem e a visibilidade escolhidas, menos o que a permissão já tirou (dinheiro sem `trip.financials`). */
export function arrangeTripColumns(input: {
  readonly allowed: readonly TripColumnKey[]
  readonly preferences: TripColumnPreferences
}): readonly TripColumnKey[] {
  return input.preferences.order.filter(
    (column) => input.allowed.includes(column) && input.preferences.visibility[column],
  )
}
