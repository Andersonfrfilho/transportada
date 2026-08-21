/* Copyright (c) 2026 Ada Technology. MIT License. */
import { compareScaledAmounts } from '@/modules/shared/decimalAmount.service'
import {
  FREIGHT_VEHICLE_CLASSES,
  type FreightVehicleClass,
} from '@/modules/shared/freightClass.constant'

import type { FreightRegion, FreightRegionStatus } from './freightRegion.types'

/** A ordem da lista é a ordem das colunas da tabela na tela. */
export const FREIGHT_REGION_SORT_COLUMNS = [
  'code',
  'name',
  'zone',
  'cities',
  'status',
  ...FREIGHT_VEHICLE_CLASSES,
] as const

export type FreightRegionSortColumn = (typeof FREIGHT_REGION_SORT_COLUMNS)[number]

export type FreightRegionSortDirection = 'asc' | 'desc'

export type FreightRegionSortState = null | Readonly<{
  column: FreightRegionSortColumn
  direction: FreightRegionSortDirection
}>

export type FreightRegionTableFilters = Readonly<{
  cityQuery: string
  classes: readonly FreightVehicleClass[]
  query: string
  statuses: readonly FreightRegionStatus[]
  zones: readonly number[]
}>

export const EMPTY_FREIGHT_REGION_TABLE_FILTERS: FreightRegionTableFilters = {
  cityQuery: '',
  classes: [],
  query: '',
  statuses: [],
  zones: [],
}

export type FreightRegionFilterOptions = Readonly<{ zones: readonly number[] }>

const DIACRITIC_PATTERN = /\p{Diacritic}/gu
const textCollator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

/** A cidade é digitada como se fala: quem procura "sertaozinho" tem de achar SERTÃOZINHO. */
function normalizeText(value: string): string {
  return value.normalize('NFD').replace(DIACRITIC_PATTERN, '').toUpperCase().trim()
}

function isFreightClassColumn(column: FreightRegionSortColumn): column is FreightVehicleClass {
  return (FREIGHT_VEHICLE_CLASSES as readonly string[]).includes(column)
}

export function rateOfRegion(
  region: FreightRegion,
  freightClass: FreightVehicleClass,
): null | string {
  return region.rates.find((rate) => rate.freightClass === freightClass)?.driverAmount ?? null
}

/** Terceiro clique no cabeçalho volta à ordem natural — sem ele não há como desfazer a ordenação. */
export function nextFreightRegionSortState(
  current: FreightRegionSortState,
  column: FreightRegionSortColumn,
): FreightRegionSortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

function matchesSelection<TValue>(selected: readonly TValue[], value: TValue): boolean {
  return selected.length === 0 || selected.includes(value)
}

export function filterFreightRegions(
  input: Readonly<{
    filters: FreightRegionTableFilters
    regions: readonly FreightRegion[]
  }>,
): readonly FreightRegion[] {
  const query = normalizeText(input.filters.query)
  const cityQuery = normalizeText(input.filters.cityQuery)

  return input.regions.filter((region) => {
    const matchesQuery =
      query === '' ||
      normalizeText(region.code).includes(query) ||
      normalizeText(region.name).includes(query)
    if (!matchesQuery) return false
    if (
      cityQuery !== '' &&
      !region.cities.some((city) => normalizeText(city.city).includes(cityQuery))
    ) {
      return false
    }
    if (!matchesSelection(input.filters.zones, region.zone)) return false
    if (
      input.filters.classes.length > 0 &&
      !input.filters.classes.some((freightClass) => rateOfRegion(region, freightClass) !== null)
    ) {
      return false
    }
    return matchesSelection(input.filters.statuses, region.status)
  })
}

/**
 * Rota sem valor para a classe vai para o fim nas duas direções: a ausência é falta de cadastro, e
 * não R$ 0,00 — por isso a comparação acontece antes da direção, fora do fator que inverte a ordem.
 */
function compareAbsentRate(
  column: FreightRegionSortColumn,
  left: FreightRegion,
  right: FreightRegion,
): null | number {
  if (!isFreightClassColumn(column)) return null
  const leftRate = rateOfRegion(left, column)
  const rightRate = rateOfRegion(right, column)
  if (leftRate === null && rightRate === null) return 0
  if (leftRate === null) return 1
  if (rightRate === null) return -1
  return null
}

function compareByColumn(
  column: FreightRegionSortColumn,
  left: FreightRegion,
  right: FreightRegion,
): number {
  if (isFreightClassColumn(column)) {
    return compareScaledAmounts(
      rateOfRegion(left, column) ?? '0',
      rateOfRegion(right, column) ?? '0',
    )
  }
  if (column === 'zone') return left.zone - right.zone
  if (column === 'cities') return left.cities.length - right.cities.length
  return textCollator.compare(left[column], right[column])
}

export function sortFreightRegions(
  input: Readonly<{
    regions: readonly FreightRegion[]
    sort: FreightRegionSortState
  }>,
): readonly FreightRegion[] {
  const sort = input.sort
  if (sort === null) return input.regions

  const factor = sort.direction === 'asc' ? 1 : -1
  return [...input.regions].sort((left, right) => {
    const absent = compareAbsentRate(sort.column, left, right)
    if (absent !== null) return absent
    return factor * compareByColumn(sort.column, left, right)
  })
}

/** As zonas nascem do cadastro carregado: zona que ninguém importou não vira filtro fantasma. */
export function collectFreightRegionFilterOptions(
  regions: readonly FreightRegion[],
): FreightRegionFilterOptions {
  return {
    zones: [...new Set(regions.map((region) => region.zone))].sort((left, right) => left - right),
  }
}

export function countActiveFreightRegionFilters(filters: FreightRegionTableFilters): number {
  const selections = [filters.classes, filters.statuses, filters.zones]
  const queries = [filters.cityQuery, filters.query]

  return (
    selections.filter((values) => values.length > 0).length +
    queries.filter((value) => value.trim() !== '').length
  )
}
