/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  fleetDriverRegions,
  freightRegionCities,
  freightRegionDriverRates,
  freightRegions,
} from '../../database/freight-region.schema.js'
import { MONEY_SCALE, formatDecimalAtScale } from '../../shared/decimal.service.js'
import type {
  FleetDriverRegionCoverage,
  FleetDriverRegionEntry,
  FreightRegion,
  FreightRegionCity,
  FreightRegionDriverRate,
  FreightRegionInput,
} from '../application/freight-region.port.js'
import { normalizeRegionCity, parseRegionCode } from '../domain/region-coverage.policy.js'

type RegionRecord = typeof freightRegions.$inferSelect
type CityRecord = typeof freightRegionCities.$inferSelect
type RateRecord = typeof freightRegionDriverRates.$inferSelect
type CoverageRecord = typeof fleetDriverRegions.$inferSelect

type MapRegionParams = {
  readonly cities: readonly CityRecord[]
  readonly rates: readonly RateRecord[]
  readonly record: RegionRecord
}

export function mapRegion({ cities, rates, record }: MapRegionParams): FreightRegion {
  return {
    cities: cities.map(mapCity),
    code: record.code,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    name: record.name,
    rates: rates.map(mapRate),
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version.toString(),
    zone: record.zone,
  }
}

export function mapCity(record: CityRecord): FreightRegionCity {
  return { city: record.city, state: record.state }
}

export function mapRate(record: RateRecord): FreightRegionDriverRate {
  return {
    driverAmount: formatDecimalAtScale(record.driverAmount, MONEY_SCALE),
    freightClass: record.freightClass,
  }
}

/**
 * A zona sai do código impresso aqui, e só aqui. Aceitá-la digitada abriria a porta para uma rota
 * `1.002` cadastrada como zona 1, que passaria a valer como preço sem contradizer nenhuma constraint.
 */
export function toRegionColumns(region: FreightRegionInput): {
  readonly code: string
  readonly name: string
  readonly zone: number
} {
  return {
    code: region.code,
    name: region.name.trim(),
    zone: parseRegionCode(region.code).zone,
  }
}

export function toCityColumns(city: FreightRegionCity): FreightRegionCity {
  return { city: normalizeRegionCity(city.city), state: city.state.trim().toUpperCase() }
}

/** Cobertura de zona não tem cidade: a coluna vazia é o que o CHECK da tabela exige. */
export function toCoverageColumns(entry: FleetDriverRegionEntry): FleetDriverRegionEntry {
  if (entry.scope === 'region') return { ...entry, city: '', state: '' }
  return { ...entry, ...toCityColumns(entry) }
}

type MapCoverageParams = {
  readonly code: string
  readonly name: string
  readonly record: CoverageRecord
  readonly zone: number
}

export function mapCoverage({
  code,
  name,
  record,
  zone,
}: MapCoverageParams): FleetDriverRegionCoverage {
  return {
    city: record.city,
    code,
    name,
    regionId: record.regionId,
    scope: record.scope,
    state: record.state,
    zone,
  }
}
