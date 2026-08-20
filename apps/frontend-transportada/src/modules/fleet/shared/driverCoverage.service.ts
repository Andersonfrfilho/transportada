/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FreightRegion, FreightRegionCity } from './freightRegion.types'

export const DRIVER_COVERAGE_SCOPES = ['city', 'region'] as const

export type FleetDriverCoverageScope = (typeof DRIVER_COVERAGE_SCOPES)[number]

/** Zona inteira e cidade solta na mesma lista: a pergunta "onde este motorista roda" é uma só. */
export type FleetDriverCoverage = Readonly<{
  city: null | string
  code: string
  name: string
  regionId: string
  scope: FleetDriverCoverageScope
  state: null | string
  zone: number
}>

export type FleetDriverCoverageEntry = Readonly<{
  city?: string
  regionId: string
  scope: FleetDriverCoverageScope
  state?: string
}>

export type DriverCoveragePill = Readonly<{
  key: string
  labelKey: string
  value: string
}>

/** A mesma dobra do resto do produto — o banco guarda a cidade em caixa alta e espaço único. */
function normalizeCoverageCity(city: null | string | undefined): string {
  return (city ?? '').trim().replace(/\s+/gu, ' ').toUpperCase()
}

function normalizeCoverageState(state: null | string | undefined): string {
  return (state ?? '').trim().toUpperCase()
}

export function coverageKey(
  coverage: Readonly<{ city: null | string; regionId: string; scope: FleetDriverCoverageScope }>,
): string {
  return `${coverage.regionId}:${coverage.scope}:${normalizeCoverageCity(coverage.city)}`
}

/** Código da rota é o que o operador lê na tabela impressa; dentro dela, a cidade em ordem. */
function sortCoverage(coverage: readonly FleetDriverCoverage[]): readonly FleetDriverCoverage[] {
  return [...coverage].sort(
    (first, second) =>
      first.code.localeCompare(second.code) || (first.city ?? '').localeCompare(second.city ?? ''),
  )
}

function isCoveredRegion(coverage: readonly FleetDriverCoverage[], regionId: string): boolean {
  return coverage.some((entry) => entry.regionId === regionId && entry.scope === 'region')
}

/**
 * A zona cobre as cidades dela por definição. Guardar as duas formas mandaria para a API uma
 * cobertura que diz duas vezes a mesma coisa, e a tela mostraria a cidade como se ela fosse um
 * recorte a menos do que a zona já dá.
 */
export function addRegionCoverage(
  input: Readonly<{ coverage: readonly FleetDriverCoverage[]; region: FreightRegion }>,
): readonly FleetDriverCoverage[] {
  const kept = input.coverage.filter((entry) => entry.regionId !== input.region.id)
  return sortCoverage([
    ...kept,
    {
      city: null,
      code: input.region.code,
      name: input.region.name,
      regionId: input.region.id,
      scope: 'region',
      state: null,
      zone: input.region.zone,
    },
  ])
}

export function addCityCoverage(
  input: Readonly<{
    city: FreightRegionCity
    coverage: readonly FleetDriverCoverage[]
    region: FreightRegion
  }>,
): readonly FleetDriverCoverage[] {
  if (isCoveredRegion(input.coverage, input.region.id)) return input.coverage

  const candidate: FleetDriverCoverage = {
    city: normalizeCoverageCity(input.city.city),
    code: input.region.code,
    name: input.region.name,
    regionId: input.region.id,
    scope: 'city',
    state: normalizeCoverageState(input.city.state),
    zone: input.region.zone,
  }
  const key = coverageKey(candidate)
  if (input.coverage.some((entry) => coverageKey(entry) === key)) return input.coverage

  return sortCoverage([...input.coverage, candidate])
}

export function removeDriverCoverage(
  coverage: readonly FleetDriverCoverage[],
  key: string,
): readonly FleetDriverCoverage[] {
  return coverage.filter((entry) => coverageKey(entry) !== key)
}

/** `exactOptionalPropertyTypes`: zona não manda `city: undefined`, manda sem a chave — a API recusa. */
export function toDriverCoverageEntries(
  coverage: readonly FleetDriverCoverage[],
): readonly FleetDriverCoverageEntry[] {
  return coverage.map((entry) =>
    entry.scope === 'region'
      ? { regionId: entry.regionId, scope: 'region' }
      : {
          city: entry.city ?? '',
          regionId: entry.regionId,
          scope: 'city',
          state: entry.state ?? '',
        },
  )
}

export function describeDriverCoveragePills(
  coverage: readonly FleetDriverCoverage[],
): readonly DriverCoveragePill[] {
  return coverage.map((entry) => ({
    key: coverageKey(entry),
    labelKey: entry.scope === 'region' ? 'driverCoverage.zonePill' : 'driverCoverage.cityPill',
    value:
      entry.scope === 'region'
        ? `${entry.code} ${entry.name}`
        : `${entry.city ?? ''}/${entry.state ?? ''} · ${entry.code} ${entry.name}`,
  }))
}
