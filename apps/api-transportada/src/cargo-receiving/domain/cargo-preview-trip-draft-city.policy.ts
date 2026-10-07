/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1: as cidades de um roteiro. A nota vinculada traz o nome e o código IBGE do XML; a linha
 * que ainda espera o XML só tem o texto da planilha (caixa alta, sem acento) — por isso a cidade é
 * casada por nome normalizado e UF, e o IBGE vem da nota quando há uma.
 */
import type {
  CargoPreviewTripDraftCity,
  TripDraftDocumentRow,
  TripDraftItemRow,
} from './cargo-preview-trip-draft.types.js'

const DIACRITICS = /\p{M}/gu

export function normalizeCityName(name: string | null): string {
  return (name ?? '').normalize('NFD').replace(DIACRITICS, '').trim().toUpperCase()
}

type Accumulator = {
  cityIbgeCode: string | null
  readonly cityName: string | null
  documentCount: number
  readonly normalizedName: string
  pendingLineCount: number
  readonly state: string
}

function toKey(input: { readonly name: string | null; readonly state: string | null }): string {
  return `${normalizeCityName(input.name)}|${input.state ?? ''}`
}

function findOrCreate(
  cities: Map<string, Accumulator>,
  input: {
    readonly code: string | null
    readonly name: string | null
    readonly state: string | null
  },
): Accumulator {
  const key = toKey(input)
  const found = cities.get(key)
  if (found !== undefined) return found
  const created: Accumulator = {
    cityIbgeCode: input.code,
    cityName: input.name,
    documentCount: 0,
    normalizedName: normalizeCityName(input.name),
    pendingLineCount: 0,
    state: input.state ?? '',
  }
  cities.set(key, created)
  return created
}

function compareCities(left: Accumulator, right: Accumulator): number {
  if (left.normalizedName !== right.normalizedName) {
    return left.normalizedName < right.normalizedName ? -1 : 1
  }
  if (left.state !== right.state) return left.state < right.state ? -1 : 1
  return (left.cityIbgeCode ?? '') < (right.cityIbgeCode ?? '') ? -1 : 1
}

export type BuildTripDraftCitiesParams = {
  /** As notas vinculadas do roteiro, uma vez cada. */
  readonly documents: readonly TripDraftDocumentRow[]
  /** As linhas do roteiro que ainda não fecham uma nota (nem inválidas). */
  readonly pendingItems: readonly TripDraftItemRow[]
}

export function buildTripDraftCities(
  params: BuildTripDraftCitiesParams,
): readonly CargoPreviewTripDraftCity[] {
  const cities = new Map<string, Accumulator>()
  for (const document of params.documents) {
    const city = findOrCreate(cities, {
      code: document.cityIbgeCode,
      name: document.cityName,
      state: document.state,
    })
    city.documentCount += 1
  }
  for (const item of params.pendingItems) {
    findOrCreate(cities, { code: null, name: item.city, state: item.state }).pendingLineCount += 1
  }
  return [...cities.values()].sort(compareCities).map((city) => ({
    cityIbgeCode: city.cityIbgeCode,
    cityName: city.cityName,
    documentCount: city.documentCount,
    pendingLineCount: city.pendingLineCount,
  }))
}
