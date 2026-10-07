/* Copyright (c) 2026 Ada Technology. MIT License. */

export type CargoSortDirection = 'asc' | 'desc'
export type CargoSort<TColumn extends string> = Readonly<{
  column: TColumn
  direction: CargoSortDirection
}>

/** asc → desc → neutro no mesmo cabeçalho; outro cabeçalho recomeça em asc (`web.md` §7). */
export function toggleCargoSort<TColumn extends string>(
  input: Readonly<{ column: TColumn; current: CargoSort<TColumn> | null }>,
): CargoSort<TColumn> | null {
  if (input.current?.column !== input.column) return { column: input.column, direction: 'asc' }
  if (input.current.direction === 'asc') return { column: input.column, direction: 'desc' }
  return null
}

function compareValues(left: number | string, right: number | string): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), 'pt-BR', { sensitivity: 'base' })
}

/** Sem valor vai por último nos dois sentidos: "sem valor" não é o menor nem o maior. */
export function compareSortValues(
  input: Readonly<{
    direction: CargoSortDirection
    left: number | string | null
    right: number | string | null
  }>,
): number {
  const { left, right } = input
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1
  const order = compareValues(left, right)
  return input.direction === 'asc' ? order : -order
}

const LIST_SEPARATOR = ','

export function readUrlList(value: string | null): string[] {
  return (value ?? '').split(LIST_SEPARATOR).filter((item) => item !== '')
}

export function writeUrlList(
  input: Readonly<{ name: string; parameters: URLSearchParams; values: readonly string[] }>,
): void {
  if (input.values.length === 0) input.parameters.delete(input.name)
  else input.parameters.set(input.name, input.values.join(LIST_SEPARATOR))
}
