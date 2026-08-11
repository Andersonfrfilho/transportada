/* Copyright (c) 2026 Ada Technology. MIT License. */
import { filterSearchableOptions } from './searchableSelect.service'

export type SelectOption = Readonly<{ label: string; value: string }>

/** Abaixo disto a lista se lê de uma olhada e o campo de busca só rouba espaço. */
export const SELECT_SEARCH_THRESHOLD = 8

/** Decidir por contagem, e não por prop, é o que faz um select novo já nascer buscável. */
export function shouldOfferSelectSearch(optionCount: number): boolean {
  return optionCount >= SELECT_SEARCH_THRESHOLD
}

export function filterSelectOptions(
  params: Readonly<{ options: readonly SelectOption[]; query: string }>,
): readonly SelectOption[] {
  return filterSearchableOptions({ options: params.options, query: params.query })
}
