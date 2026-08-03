/* Copyright (c) 2026 Ada Technology. MIT License. */

export type TableColumnStorage = Readonly<{
  getItem: (key: string) => null | string
  setItem: (key: string, value: string) => void
}>

export type TableColumnPreferences<TColumn extends string> = Readonly<{
  order: readonly TColumn[]
  visibility: Readonly<Record<TColumn, boolean>>
}>

type ReadInput<TColumn extends string> = Readonly<{
  columns: readonly TColumn[]
  storage: TableColumnStorage | null
  storageKey: string
}>

type WriteInput<TColumn extends string> = Readonly<{
  preferences: TableColumnPreferences<TColumn>
  storage: TableColumnStorage | null
  storageKey: string
}>

export function reorderTableColumns<TColumn extends string>(
  order: readonly TColumn[],
  column: TColumn,
  direction: 'down' | 'up',
): readonly TColumn[] {
  const index = order.indexOf(column)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= order.length) return order
  const reordered = [...order]
  const moved = reordered[index]
  const displaced = reordered[target]
  if (moved === undefined || displaced === undefined) return order
  reordered[index] = displaced
  reordered[target] = moved
  return reordered
}

export function allColumnsVisible<TColumn extends string>(
  columns: readonly TColumn[],
): Record<TColumn, boolean> {
  return Object.fromEntries(columns.map((column) => [column, true])) as Record<TColumn, boolean>
}

export function readTableColumnPreferences<TColumn extends string>(
  input: ReadInput<TColumn>,
): TableColumnPreferences<TColumn> {
  const fallback = { order: input.columns, visibility: allColumnsVisible(input.columns) }
  if (input.storage === null) return fallback
  try {
    const raw = input.storage.getItem(input.storageKey)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return fallback
    const record = parsed as Record<string, unknown>
    return {
      order: sanitizeOrder(record.order, input.columns),
      visibility: sanitizeVisibility(record.visibility, input.columns),
    }
  } catch {
    return fallback
  }
}

export function writeTableColumnPreferences<TColumn extends string>(
  input: WriteInput<TColumn>,
): void {
  if (input.storage === null) return
  try {
    input.storage.setItem(input.storageKey, JSON.stringify(input.preferences))
  } catch {
    return
  }
}

function sanitizeOrder<TColumn extends string>(
  value: unknown,
  columns: readonly TColumn[],
): readonly TColumn[] {
  if (!Array.isArray(value)) return columns
  const known = value.filter((column): column is TColumn =>
    columns.some((candidate) => candidate === column),
  )
  const unique = known.filter((column, index) => known.indexOf(column) === index)
  return [...unique, ...columns.filter((column) => !unique.includes(column))]
}

function sanitizeVisibility<TColumn extends string>(
  value: unknown,
  columns: readonly TColumn[],
): Record<TColumn, boolean> {
  const visibility = allColumnsVisible(columns)
  if (typeof value !== 'object' || value === null) return visibility
  for (const [key, flag] of Object.entries(value)) {
    const column = columns.find((candidate) => candidate === key)
    if (column !== undefined && typeof flag === 'boolean') visibility[column] = flag
  }
  return visibility
}
