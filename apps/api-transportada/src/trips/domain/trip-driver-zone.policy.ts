/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  coversRegion,
  foldRegionCity,
  parseRegionCode,
} from '../../freight-regions/domain/region-coverage.policy.js'
import { VALUATION_GAPS, type ValuationGap } from './trip-valuation.policy.js'

/** Uma parada da viagem, reduzida ao que decide zona. `sequence` é `null` sem roteiro planejado. */
export type TripZoneStop = {
  readonly city: null | string
  readonly sequence: null | number
  readonly state: null | string
}

/** Uma linha de `freight_region_cities` com o código impresso da zona a que ela pertence. */
export type RegionCityEntry = {
  readonly city: string
  readonly code: string
  readonly regionId: string
  readonly state: string
}

/** Uma linha de `fleet_driver_regions`, com o código da zona coberta. */
export type DriverZoneCoverage = {
  readonly city: string
  readonly code: string
  readonly regionId: string
  readonly scope: 'city' | 'region'
  readonly state: string
}

/** Spec 127: uma zona nomeada como a 123 nomeia — código impresso e a cidade que a alcançou. */
export type ZoneLabel = { readonly city: string; readonly code: string }

export type TripDriverZone =
  | { readonly cityToRegister: string; readonly gap: ValuationGap }
  | { readonly gap: ValuationGap }
  /** Spec 127: duas ou mais rotas empataram na contagem — o operador decide, o cálculo não. */
  | { readonly gap: ValuationGap; readonly tiedZones: readonly ZoneLabel[] }
  /**
   * Spec 110 D7: o **código** da zona e a **cidade que a decidiu** viajam junto do id — o id é chave
   * de banco e não diz nada a ninguém.
   *
   * Spec 127: `isCoveredByDriver` é só o lembrete de acrescentar a zona na ficha. Ele **não** muda a
   * zona, o preço nem a origem do valor: a cobertura do motorista serve ao roteiro.
   */
  | {
      readonly isCoveredByDriver: boolean
      readonly regionCity: string
      readonly regionCode: string
      readonly regionId: string
    }

export type ResolveTripDriverZoneParams = {
  readonly catalog: readonly RegionCityEntry[]
  readonly coverage: readonly DriverZoneCoverage[]
  readonly stops: readonly TripZoneStop[]
}

/**
 * Qual zona paga esta viagem (ADR-0049 §3: o agregado é pago por `(zona, classe)`).
 *
 * Spec 127 — **a rota é a que casa com mais cidades da viagem.** Cada cidade distinta da viagem
 * vota em toda rota (família de `parseRegionCode`) em que aparece na planilha; vence a rota com mais
 * cidades. A faixa é a mais alta alcançada dentro dela (D1 da 086: o destino mais distante paga, e
 * a faixa alta cobre as baixas da família).
 *
 * ⚠️ O catálogo é **lista por cidade**, nunca uma linha: uma cidade em duas rotas é legítimo (a
 * unicidade é `(company_id, region_id, city, state)`), e o `Map` de uma linha só sobrescrevia a rota
 * que o Postgres devolvesse primeiro — o mesmo defeito de ordem que a 086 corrigiu em BARRETOS.
 *
 * - `{ regionId, isCoveredByDriver }` — a zona decidida;
 * - `{ gap: CITY_WITHOUT_REGION, cityToRegister }` — nenhuma parada está na tabela;
 * - `{ gap: DRIVER_ROUTE_AMBIGUOUS, tiedZones }` — empate real, com as zonas nomeadas;
 * - `{ gap: NO_DRIVER_RATE }` — nenhuma parada tem cidade, e não há nada a nomear.
 */
export function resolveTripDriverZone(input: ResolveTripDriverZoneParams): TripDriverZone {
  const catalog = groupCatalogByCity(input.catalog)
  const votes = collectRouteVotes({ catalog, stops: input.stops })

  if (votes.size === 0) {
    const unmatched = lastUnmatchedCity(input.stops)
    if (unmatched === null) return { gap: VALUATION_GAPS.noDriverRate }

    return { cityToRegister: unmatched, gap: VALUATION_GAPS.cityWithoutRegion }
  }

  const bands = [...votes.values()].map(highestBand)
  const topCount = Math.max(...[...votes.values()].map((vote) => vote.cities.size))
  const winners = [...votes.values()].filter((vote) => vote.cities.size === topCount)
  if (winners.length > 1) {
    return {
      gap: VALUATION_GAPS.driverRouteAmbiguous,
      tiedZones: winners
        .map(highestBand)
        .sort(byZoneCode)
        .map((band) => ({ city: band.entry.city, code: band.entry.code })),
    }
  }

  const [winner] = winners
  const band = bands.find((candidate) => candidate.family === winner?.family)
  if (band === undefined) return { gap: VALUATION_GAPS.noDriverRate }

  return {
    isCoveredByDriver: isCovered({ coverage: input.coverage, destination: band.entry }),
    regionCity: band.entry.city,
    regionCode: band.entry.code,
    regionId: band.entry.regionId,
  }
}

type CatalogMatch = { readonly entry: RegionCityEntry; readonly sequence: null | number }
type RouteVote = {
  readonly cities: Set<string>
  readonly family: string
  readonly matches: CatalogMatch[]
}
type RouteBand = { readonly entry: RegionCityEntry; readonly family: string }

function groupCatalogByCity(
  catalog: readonly RegionCityEntry[],
): ReadonlyMap<string, readonly RegionCityEntry[]> {
  const byCity = new Map<string, RegionCityEntry[]>()
  for (const entry of catalog) {
    const key = cityKey(entry)
    byCity.set(key, [...(byCity.get(key) ?? []), entry])
  }

  return byCity
}

/** A cidade em duas rotas vota nas duas; a mesma cidade repetida em paradas conta uma vez. */
function collectRouteVotes(input: {
  readonly catalog: ReadonlyMap<string, readonly RegionCityEntry[]>
  readonly stops: readonly TripZoneStop[]
}): ReadonlyMap<string, RouteVote> {
  const votes = new Map<string, RouteVote>()
  for (const stop of input.stops) {
    if (stop.city === null || stop.state === null) continue

    const key = cityKey(stop)
    for (const entry of input.catalog.get(key) ?? []) {
      const family = parseRegionCode(entry.code).family
      const vote = votes.get(family) ?? { cities: new Set(), family, matches: [] }
      vote.cities.add(key)
      vote.matches.push({ entry, sequence: stop.sequence })
      votes.set(family, vote)
    }
  }

  return votes
}

/**
 * A faixa mais alta que as paradas alcançam dentro da rota. Duas cidades na mesma faixa: nomeia a
 * de parada mais tardia, e sem roteiro a primeira em ordem alfabética — nunca a ordem das linhas.
 */
function highestBand(vote: RouteVote): RouteBand {
  const [best] = [...vote.matches].sort(byBandThenStop)

  return {
    entry: best?.entry ?? { city: '', code: '', regionId: '', state: '' },
    family: vote.family,
  }
}

function byBandThenStop(first: CatalogMatch, second: CatalogMatch): number {
  const zoneDelta = parseRegionCode(second.entry.code).zone - parseRegionCode(first.entry.code).zone
  if (zoneDelta !== 0) return zoneDelta

  const sequenceDelta = (second.sequence ?? -1) - (first.sequence ?? -1)
  if (sequenceDelta !== 0) return sequenceDelta

  return cityKey(first.entry).localeCompare(cityKey(second.entry))
}

function byZoneCode(first: RouteBand, second: RouteBand): number {
  const firstCode = parseRegionCode(first.entry.code)
  const secondCode = parseRegionCode(second.entry.code)

  return firstCode.family === secondCode.family
    ? firstCode.zone - secondCode.zone
    : firstCode.family.localeCompare(secondCode.family, undefined, { numeric: true })
}

/**
 * Cobertura por zona é acumulativa dentro da família; cobertura por cidade vale **para aquela
 * cidade**, e não empresta a zona inteira — é o que a distingue no CHECK de `fleet_driver_regions`.
 */
function isCovered(input: {
  readonly coverage: readonly DriverZoneCoverage[]
  readonly destination: RegionCityEntry
}): boolean {
  return input.coverage.some((entry) => {
    if (entry.scope === 'city') {
      return (
        entry.regionId === input.destination.regionId &&
        cityKey(entry) === cityKey(input.destination)
      )
    }

    return coversRegion({ candidate: input.destination.code, coverage: entry.code })
  })
}

/** O nome que a lacuna imprime: a última parada que tinha cidade e não achou zona. */
function lastUnmatchedCity(stops: readonly TripZoneStop[]): null | string {
  const last = stops.filter((stop) => stop.city !== null && stop.state !== null).at(-1)

  return last === undefined ? null : `${last.city}/${last.state}`
}

function cityKey(value: { readonly city: null | string; readonly state: null | string }): string {
  return `${foldRegionCity(value.city ?? '')}/${(value.state ?? '').trim().toUpperCase()}`
}
