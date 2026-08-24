/* Copyright (c) 2026 Ada Technology. MIT License. */
import { normalizeSearchText, type SearchableSelectOption } from './searchableSelect.service'

/** `description` é a segunda linha da opção: o que distingue duas placas do mesmo modelo. */
export type MultiSelectOption = SearchableSelectOption & Readonly<{ description?: string }>

/** A busca lê as duas linhas: quem procura pelo modelo não sabe a placa — é por isso que procura. */
export function filterMultiSelectOptions(
  input: Readonly<{ options: readonly MultiSelectOption[]; query: string }>,
): readonly MultiSelectOption[] {
  const query = input.query.trim()
  if (query === '') return input.options
  const normalizedQuery = normalizeSearchText(query)
  return input.options.filter((option) =>
    normalizeSearchText(`${option.label} ${option.description ?? ''}`).includes(normalizedQuery),
  )
}

/**
 * A ordem é a das opções, não a de clique: o rótulo do gatilho e as pílulas leem da mesma lista, e
 * um valor gravado que saiu do catálogo continua contando — some-lo esconderia vínculo existente.
 */
export function resolveMultiSelectSelection(
  input: Readonly<{ options: readonly MultiSelectOption[]; values: readonly string[] }>,
): readonly MultiSelectOption[] {
  const known = input.options.filter((option) => input.values.includes(option.value))
  const orphans = input.values
    .filter((value) => !input.options.some((option) => option.value === value))
    .map((value) => ({ label: value, value }))
  return [...known, ...orphans]
}

export function toggleMultiSelectValue(
  input: Readonly<{ value: string; values: readonly string[] }>,
): readonly string[] {
  return input.values.includes(input.value)
    ? input.values.filter((current) => current !== input.value)
    : [...input.values, input.value]
}
