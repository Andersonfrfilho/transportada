/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A listagem de ocorrências une duas tabelas — a da nota e a da parada — e a página é decidida
 * **depois** da união, em memória, sobre no máximo `limit + 1` linhas de cada fonte. A regra é
 * pura de propósito: o desempate (createdAt, id) precisa ser idêntico ao das duas consultas,
 * senão o cursor pula ou repete linha na fronteira da página.
 */

export type OccurrenceFeedOrder = 'asc' | 'desc'

export type OccurrenceFeedEntry = {
  readonly createdAt: Date
  readonly id: string
}

function compareEntries(
  first: OccurrenceFeedEntry,
  second: OccurrenceFeedEntry,
  order: OccurrenceFeedOrder,
): number {
  const byTime = first.createdAt.getTime() - second.createdAt.getTime()
  const byId = first.id < second.id ? -1 : first.id > second.id ? 1 : 0
  const ascending = byTime !== 0 ? byTime : byId
  return order === 'asc' ? ascending : -ascending
}

export type MergeOccurrenceFeedResult<TEntry extends OccurrenceFeedEntry> = {
  readonly hasMore: boolean
  readonly items: readonly TEntry[]
}

/**
 * Cada fonte já vem limitada a `limit + 1` e filtrada pelo cursor; aqui só se ordena, corta e
 * decide se existe página seguinte. `hasMore` é "sobrou linha depois do corte" — e é correto
 * mesmo quando a sobra veio toda de uma fonte só.
 */
export function mergeOccurrenceFeed<TEntry extends OccurrenceFeedEntry>(input: {
  readonly limit: number
  readonly order: OccurrenceFeedOrder
  readonly sources: readonly (readonly TEntry[])[]
}): MergeOccurrenceFeedResult<TEntry> {
  const merged = input.sources
    .flatMap((source) => [...source])
    .sort((first, second) => compareEntries(first, second, input.order))

  return { hasMore: merged.length > input.limit, items: merged.slice(0, input.limit) }
}
