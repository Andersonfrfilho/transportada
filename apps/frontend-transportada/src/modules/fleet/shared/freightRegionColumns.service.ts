/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import {
  readTableColumnPreferences,
  reorderTableColumns,
  writeTableColumnPreferences,
  type TableColumnPreferences,
  type TableColumnStorage,
} from '@/modules/shared/tableColumnPreferences.service'

import type { FreightRegion } from './freightRegion.types'
import {
  FREIGHT_REGION_SORT_COLUMNS,
  rateOfRegion,
  type FreightRegionSortColumn,
} from './freightRegionTable.service'

/** Toda coluna da tabela é ordenável e escondível: as duas listas são a mesma. */
export const FREIGHT_REGION_COLUMN_KEYS = FREIGHT_REGION_SORT_COLUMNS

export type FreightRegionColumnKey = FreightRegionSortColumn

export type FreightRegionColumnPreferences = TableColumnPreferences<FreightRegionColumnKey>

const STORAGE_KEY = 'fleet.regionColumns'
const CITY_SEPARATOR = ', '

export function readFreightRegionColumnPreferences(
  storage: TableColumnStorage | null,
): FreightRegionColumnPreferences {
  return readTableColumnPreferences({
    columns: FREIGHT_REGION_COLUMN_KEYS,
    storage,
    storageKey: STORAGE_KEY,
  })
}

export function writeFreightRegionColumnPreferences(
  input: Readonly<{
    preferences: FreightRegionColumnPreferences
    storage: TableColumnStorage | null
  }>,
): void {
  writeTableColumnPreferences({
    preferences: input.preferences,
    storage: input.storage,
    storageKey: STORAGE_KEY,
  })
}

export function describeRegionCities(region: FreightRegion): string {
  return region.cities.map((city) => `${city.city}/${city.state}`).join(CITY_SEPARATOR)
}

/** Classe sem linha de valor é cadastro faltando, não R$ 0,00 — a célula tem de dizer isso. */
export function readFreightRegionColumnValue(
  input: Readonly<{
    column: FreightRegionColumnKey
    notInformedLabel: string
    region: FreightRegion
    statusLabel: string
  }>,
): string {
  const { column, notInformedLabel, region, statusLabel } = input
  if (column === 'code') return region.code
  if (column === 'name') return region.name
  if (column === 'zone') return String(region.zone)
  if (column === 'cities') return describeRegionCities(region) || notInformedLabel
  // O status é slug fechado no banco: traduzir é papel de quem tem o `t`, não deste serviço puro.
  if (column === 'status') return statusLabel

  const rate = rateOfRegion(region, column)
  return rate === null ? notInformedLabel : formatAmount(rate)
}

export function reorderFreightRegionColumns(
  order: readonly FreightRegionColumnKey[],
  column: FreightRegionColumnKey,
  direction: 'down' | 'up',
): readonly FreightRegionColumnKey[] {
  return reorderTableColumns(order, column, direction)
}
