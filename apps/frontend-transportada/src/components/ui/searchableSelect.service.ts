/* Copyright (c) 2026 Ada Technology. MIT License. */

export type SearchableSelectOption = Readonly<{ label: string; value: string }>

export type ResolveCustomSearchableOption = (query: string) => SearchableSelectOption | undefined

type FilterSearchableOptionsInput = Readonly<{
  options: readonly SearchableSelectOption[]
  query: string
  resolveCustomOption?: ResolveCustomSearchableOption | undefined
}>

const DIACRITIC_PATTERN = /[\u0300-\u036f]/g

export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(DIACRITIC_PATTERN, '').toLowerCase()
}

/** Uma lista fechada esconderia um valor legítimo fora do catálogo — o item customizado é a saída. */
export function filterSearchableOptions(
  input: FilterSearchableOptionsInput,
): readonly SearchableSelectOption[] {
  const query = input.query.trim()
  if (query === '') return input.options
  const normalizedQuery = normalizeSearchText(query)
  const matches = input.options.filter((option) =>
    normalizeSearchText(option.label).includes(normalizedQuery),
  )
  const custom = input.resolveCustomOption?.(query)
  if (custom === undefined) return matches
  if (matches.some((option) => option.value === custom.value)) return matches
  return [...matches, custom]
}

/** O gatilho nunca pode mostrar o placeholder tendo valor real — divergência silenciosa com o payload. */
export function resolveSearchableSelectLabel(
  input: Readonly<{ options: readonly SearchableSelectOption[]; value: string }>,
): string | undefined {
  if (input.value === '') return undefined
  return input.options.find((option) => option.value === input.value)?.label ?? input.value
}
