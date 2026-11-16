/* Copyright (c) 2026 Ada Technology. MIT License. */

export type SearchableSelectOption = Readonly<{ label: string; value: string; logo?: string }>

export type ResolveCustomSearchableOption = (query: string) => SearchableSelectOption | undefined

type FilterSearchableOptionsInput<TOption extends SearchableSelectOption> = Readonly<{
  options: readonly TOption[]
  query: string
  resolveCustomOption?: ((query: string) => TOption | undefined) | undefined
}>

/** Prefixo do valor da opção "Adicionar «nome»": nunca colide com um valor real (uuid, código). */
export const SEARCHABLE_CREATE_VALUE_PREFIX = '__create__:'

const DIACRITIC_PATTERN = /[\u0300-\u036f]/g

export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(DIACRITIC_PATTERN, '').toLowerCase()
}

/**
 * Uma lista fechada esconderia um valor legítimo fora do catálogo — o item customizado é a saída.
 * Genérico porque a opção pode carregar mais que rótulo e valor, e filtrar não pode apagar isso.
 */
export function filterSearchableOptions<TOption extends SearchableSelectOption>(
  input: FilterSearchableOptionsInput<TOption>,
): readonly TOption[] {
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

/**
 * Digitar e Enter cadastra: o texto que ainda não é nenhuma opção vira a opção "Adicionar «texto»". Texto que já é uma
 * opção (sem diferenciar caixa e acento) não oferece cadastro: o cadastro duplicaria o que já existe.
 */
export function resolveCreatableOption(
  input: Readonly<{
    createLabel: (name: string) => string
    options: readonly SearchableSelectOption[]
    query: string
  }>,
): SearchableSelectOption | undefined {
  const name = input.query.trim()
  if (name === '') return undefined
  const normalized = normalizeSearchText(name)
  if (input.options.some((option) => normalizeSearchText(option.label) === normalized)) {
    return undefined
  }
  return { label: input.createLabel(name), value: `${SEARCHABLE_CREATE_VALUE_PREFIX}${name}` }
}

/** O nome digitado dentro do valor da opção de cadastro; `undefined` para uma opção comum. */
export function readCreatableName(value: string): string | undefined {
  return value.startsWith(SEARCHABLE_CREATE_VALUE_PREFIX)
    ? value.slice(SEARCHABLE_CREATE_VALUE_PREFIX.length)
    : undefined
}
