/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteProfileDestinationCity } from './cteProfiles.types'

/** Uma cidade por linha, `Cidade/UF`. Aceita também `Cidade - UF` e `Cidade, UF`. */
const CITY_LINE = /^(.+?)\s*[/,-]\s*([A-Za-z]{2})$/u

export type DestinationCitiesParse = Readonly<{
  cities: readonly CteProfileDestinationCity[]
  invalidLines: readonly string[]
}>

export function parseDestinationCities(text: string): DestinationCitiesParse {
  const cities: CteProfileDestinationCity[] = []
  const invalidLines: string[] = []
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim()
    if (line === '') continue
    const match = CITY_LINE.exec(line)
    const city = match?.[1]?.trim()
    const state = match?.[2]
    if (city === undefined || city === '' || state === undefined) {
      invalidLines.push(line)
      continue
    }
    cities.push({ city, state: state.toUpperCase() })
  }
  return { cities, invalidLines }
}

/** Vazio quer dizer "qualquer cidade" (`null`), nunca lista vazia. */
export function destinationCitiesFromText(
  text: string,
): readonly CteProfileDestinationCity[] | null {
  const { cities } = parseDestinationCities(text)
  return cities.length === 0 ? null : cities
}

export function destinationCitiesToText(
  cities: readonly CteProfileDestinationCity[] | null | undefined,
): string {
  return (cities ?? []).map((item) => `${item.city}/${item.state}`).join('\n')
}
