/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { FreightRegion } from '../shared/freightRegion.types'
import {
  clearFreightRegionFilterField,
  describeFreightRegionFilterPills,
  type FreightRegionFilterPill,
  type FreightRegionPillField,
} from '../shared/freightRegionFilterPills.service'
import {
  collectFreightRegionFilterOptions,
  countActiveFreightRegionFilters,
  EMPTY_FREIGHT_REGION_TABLE_FILTERS,
  filterFreightRegions,
  nextFreightRegionSortState,
  sortFreightRegions,
  type FreightRegionFilterOptions,
  type FreightRegionSortColumn,
  type FreightRegionSortState,
  type FreightRegionTableFilters,
} from '../shared/freightRegionTable.service'
import {
  resolveVehicleSelectionState,
  toggleVisibleSelection,
  type VehicleSelectionState,
} from '../shared/vehicleTable.service'

export type FreightRegionTableController = Readonly<{
  activeFilterCount: number
  clearFilterField: (field: FreightRegionPillField) => void
  clearFilters: () => void
  clearSelection: () => void
  filterOptions: FreightRegionFilterOptions
  filters: FreightRegionTableFilters
  isFilterPanelOpen: boolean
  isSelected: (regionId: string) => boolean
  pills: readonly FreightRegionFilterPill[]
  regions: readonly FreightRegion[]
  selectedRegions: readonly FreightRegion[]
  selectionState: VehicleSelectionState
  setFilterPanelOpen: (isOpen: boolean) => void
  setFilters: (filters: FreightRegionTableFilters) => void
  sort: FreightRegionSortState
  toggleAllVisible: () => void
  toggleRegion: (regionId: string) => void
  toggleSort: (column: FreightRegionSortColumn) => void
  totalCount: number
}>

export function useFreightRegionTable(
  regions: readonly FreightRegion[],
): FreightRegionTableController {
  const [filters, setFilters] = useState<FreightRegionTableFilters>(
    EMPTY_FREIGHT_REGION_TABLE_FILTERS,
  )
  const [sort, setSort] = useState<FreightRegionSortState>(null)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [isFilterPanelOpen, setFilterPanelOpen] = useState(false)

  const visible = sortFreightRegions({ regions: filterFreightRegions({ filters, regions }), sort })
  const visibleIds = visible.map((region) => region.id)
  const selected = new Set(selectedIds)

  function toggleRegion(regionId: string): void {
    setSelectedIds((previous) =>
      previous.includes(regionId)
        ? previous.filter((id) => id !== regionId)
        : [...previous, regionId],
    )
  }

  function clearFilters(): void {
    setFilters(EMPTY_FREIGHT_REGION_TABLE_FILTERS)
    setSort(null)
  }

  return {
    activeFilterCount: countActiveFreightRegionFilters(filters),
    clearFilterField: (field) => setFilters(clearFreightRegionFilterField(filters, field)),
    clearFilters,
    clearSelection: () => setSelectedIds([]),
    filterOptions: collectFreightRegionFilterOptions(regions),
    filters,
    isFilterPanelOpen,
    isSelected: (regionId) => selected.has(regionId),
    pills: describeFreightRegionFilterPills(filters),
    regions: visible,
    // A ação em massa age sobre o que a tabela mostra: rota filtrada fora não entra no lote
    selectedRegions: visible.filter((region) => selected.has(region.id)),
    selectionState: resolveVehicleSelectionState({ selectedIds, visibleIds }),
    setFilterPanelOpen,
    setFilters,
    sort,
    toggleAllVisible: () => setSelectedIds(toggleVisibleSelection({ selectedIds, visibleIds })),
    toggleRegion,
    toggleSort: (column) => setSort(nextFreightRegionSortState(sort, column)),
    totalCount: regions.length,
  }
}
