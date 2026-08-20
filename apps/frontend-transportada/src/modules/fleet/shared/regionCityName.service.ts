/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FreightRegionCity } from './freightRegion.types'

const DIACRITIC_PATTERN = /[̀-ͯ]/g
const NON_NAME_PATTERN = /[^A-Z0-9 ]+/g
const WHITESPACE_PATTERN = /\s+/g

/** A planilha do cliente cola uma cidade por linha, mas também em vírgula e ponto e vírgula. */
const CITY_SEPARATOR_PATTERN = /[\n\r,;]+/

/**
 * A dobra do nome de município, num lugar só. Ela decide três coisas que precisam concordar: se a
 * lista colada casa com a linha do IBGE, se a cidade já está na zona, e qual polígono do mapa
 * pertence a qual zona. Três cópias divergiriam, e a divergência apareceria como cidade que some do
 * desenho sem sumir da tabela.
 *
 * A pontuação cai porque o cliente escreve `MOGI-MIRIM` e o IBGE publica `Mogi Mirim`; o acento cai
 * porque a planilha impressa vem sem ele.
 */
export function foldRegionCityName(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITIC_PATTERN, '')
    .toUpperCase()
    .replace(NON_NAME_PATTERN, ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim()
}

/** A cidade só é única dentro do estado — a chave da zona é a mesma do índice do banco. */
export function cityKeyOf(city: FreightRegionCity): string {
  return `${foldRegionCityName(city.city)}/${city.state.trim().toUpperCase()}`
}

export function splitRegionCityNames(value: string): readonly string[] {
  return value
    .split(CITY_SEPARATOR_PATTERN)
    .map((name) => name.trim())
    .filter((name) => name !== '')
}

export type RegionCityEntryInput = Readonly<{
  cities: readonly FreightRegionCity[]
  municipalities: readonly string[]
  names: readonly string[]
  state: string
}>

export type RegionCityEntryResult = Readonly<{
  added: readonly string[]
  cities: readonly FreightRegionCity[]
  duplicated: readonly string[]
  unmatched: readonly string[]
}>

function toCanonicalNames(municipalities: readonly string[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const municipality of municipalities) {
    const key = foldRegionCityName(municipality)
    if (key === '' || names.has(key)) continue
    names.set(key, municipality)
  }

  return names
}

/**
 * A busca escolhe da lista e a colagem casa contra ela, e as duas caem na grafia do IBGE: sem isso a
 * mesma cidade viraria duas linhas da zona conforme como foi digitada. O que não casou volta
 * **nomeado** em vez de ser descartado — cidade que desaparece do cadastro sem aviso é frete que
 * ninguém sabe que deixou de ser pago.
 *
 * Lista vazia é provedor do IBGE fora do ar, e cadastro não para por isso: o que a pessoa digitou
 * entra com a grafia dela. Sem UF não entra nada, porque o município só é único dentro do estado.
 */
export function resolveRegionCityEntry(input: RegionCityEntryInput): RegionCityEntryResult {
  const state = input.state.trim().toUpperCase()
  const names = toCanonicalNames(input.municipalities)
  const seen = new Set(input.cities.map(cityKeyOf))
  const cities = [...input.cities]
  const added: string[] = []
  const duplicated: string[] = []
  const unmatched: string[] = []

  for (const name of input.names) {
    const typed = name.trim()
    if (typed === '') continue

    const canonical = names.size === 0 ? typed : names.get(foldRegionCityName(typed))
    if (state === '' || canonical === undefined) {
      unmatched.push(name)
      continue
    }

    const city: FreightRegionCity = { city: canonical, state }
    if (seen.has(cityKeyOf(city))) {
      duplicated.push(name)
      continue
    }

    seen.add(cityKeyOf(city))
    cities.push(city)
    added.push(canonical)
  }

  return { added, cities, duplicated, unmatched }
}
