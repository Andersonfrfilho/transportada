import type { IconName } from './icon'

/* Copyright (c) 2026 Ada Technology. MIT License. */
import { normalizeSearchText } from './searchableSelect.service'

/**
 * `swatch` é um valor de `background`: a opção pinta uma cor que o rótulo só descreve.
 * `description` é a segunda linha, como no multi-select: o que distingue duas placas parecidas.
 */
export type SelectOption = Readonly<{
  label: string
  description?: string
  /** Símbolo do que a opção é (o tipo do veículo, por exemplo) — nunca decoração solta. */
  icon?: IconName
  swatch?: string
  value: string
}>

/** Abaixo disto a lista se lê de uma olhada e o campo de busca só rouba espaço. */
export const SELECT_SEARCH_THRESHOLD = 8

/** Decidir por contagem, e não por prop, é o que faz um select novo já nascer buscável. */
export function shouldOfferSelectSearch(optionCount: number): boolean {
  return optionCount >= SELECT_SEARCH_THRESHOLD
}

export type SelectSearchKeyAction = 'close' | 'commit' | 'move-down' | 'move-up' | 'type'

const SELECT_SEARCH_KEY_ACTION: Readonly<Record<string, SelectSearchKeyAction>> = {
  ArrowDown: 'move-down',
  ArrowUp: 'move-up',
  Enter: 'commit',
  Escape: 'close',
  Tab: 'close',
}

/**
 * Tudo que não navega a lista pertence ao campo de texto — inclusive o espaço, que na raiz do
 * select é atalho de seleção e por isso engolia a tecla no meio de uma busca por "santo andre".
 */
export function resolveSelectSearchKey(key: string): SelectSearchKeyAction {
  return SELECT_SEARCH_KEY_ACTION[key] ?? 'type'
}

/** A busca lê as duas linhas: quem procura pelo modelo não sabe a placa — é por isso que procura. */
export function filterSelectOptions(
  params: Readonly<{ options: readonly SelectOption[]; query: string }>,
): readonly SelectOption[] {
  const query = params.query.trim()
  if (query === '') return params.options
  const normalizedQuery = normalizeSearchText(query)
  return params.options.filter((option) =>
    normalizeSearchText(`${option.label} ${option.description ?? ''}`).includes(normalizedQuery),
  )
}
