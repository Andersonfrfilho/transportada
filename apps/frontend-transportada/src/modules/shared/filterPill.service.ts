/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Lado aberto de uma faixa: o filtro vale, mas sem limite daquele lado. */
export const OPEN_RANGE_MARK = '…'
export const RANGE_SEPARATOR = '–'
export const SELECTION_SEPARATOR = ', '

type RangeValueInput = Readonly<{
  from: string
  to: string
  format?: (value: string) => string
}>

type SelectionInput = Readonly<{
  defaults: readonly string[]
  values: readonly string[]
}>

export function describeRangeValue(input: RangeValueInput): string {
  const from = input.from.trim()
  const to = input.to.trim()
  if (from.length === 0 && to.length === 0) return ''
  const format = input.format ?? ((value: string): string => value)
  const start = from.length === 0 ? OPEN_RANGE_MARK : format(from)
  const end = to.length === 0 ? OPEN_RANGE_MARK : format(to)
  return `${start}${RANGE_SEPARATOR}${end}`
}

/** Filtro de seleção múltipla parte de um default que já esconde valores: sair dele é o que conta. */
export function selectionDiffersFromDefault(input: SelectionInput): boolean {
  if (input.values.length !== input.defaults.length) return true
  const defaults = new Set(input.defaults)
  return input.values.some((value) => !defaults.has(value))
}
