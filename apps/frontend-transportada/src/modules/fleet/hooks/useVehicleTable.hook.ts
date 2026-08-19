/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { FleetVehicleDetail } from '../shared/fleet.types'
import {
  clearVehicleFilterField,
  describeVehicleFilterPills,
  type VehicleFilterPill,
  type VehiclePillField,
} from '../shared/vehicleFilterPills.service'
import {
  collectVehicleFilterOptions,
  countActiveVehicleFilters,
  EMPTY_VEHICLE_TABLE_FILTERS,
  filterVehicles,
  nextVehicleSortState,
  resolveVehicleSelectionState,
  sortVehicles,
  toggleVisibleSelection,
  type VehicleFilterOptions,
  type VehicleSelectionState,
  type VehicleSortColumn,
  type VehicleSortState,
  type VehicleTableFilters,
} from '../shared/vehicleTable.service'

export type VehicleTableController = Readonly<{
  activeFilterCount: number
  clearFilterField: (field: VehiclePillField) => void
  clearFilters: () => void
  clearSelection: () => void
  filterOptions: VehicleFilterOptions
  filters: VehicleTableFilters
  isFilterPanelOpen: boolean
  isSelected: (vehicleId: string) => boolean
  pills: readonly VehicleFilterPill[]
  selectedVehicles: readonly FleetVehicleDetail[]
  selectionState: VehicleSelectionState
  setFilters: (filters: VehicleTableFilters) => void
  setFilterPanelOpen: (isOpen: boolean) => void
  sort: VehicleSortState
  toggleAllVisible: () => void
  toggleSort: (column: VehicleSortColumn) => void
  toggleVehicle: (vehicleId: string) => void
  totalCount: number
  vehicles: readonly FleetVehicleDetail[]
}>

export function useVehicleTable(vehicles: readonly FleetVehicleDetail[]): VehicleTableController {
  const [filters, setFilters] = useState<VehicleTableFilters>(EMPTY_VEHICLE_TABLE_FILTERS)
  const [sort, setSort] = useState<VehicleSortState>(null)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [isFilterPanelOpen, setFilterPanelOpen] = useState(false)

  const visible = sortVehicles({ sort, vehicles: filterVehicles({ filters, vehicles }) })
  const visibleIds = visible.map((vehicle) => vehicle.id)
  const selected = new Set(selectedIds)

  function toggleVehicle(vehicleId: string): void {
    setSelectedIds((previous) =>
      previous.includes(vehicleId)
        ? previous.filter((id) => id !== vehicleId)
        : [...previous, vehicleId],
    )
  }

  function clearFilters(): void {
    setFilters(EMPTY_VEHICLE_TABLE_FILTERS)
    setSort(null)
  }

  return {
    activeFilterCount: countActiveVehicleFilters(filters),
    clearFilterField: (field) => setFilters(clearVehicleFilterField({ field, filters })),
    clearFilters,
    clearSelection: () => setSelectedIds([]),
    filterOptions: collectVehicleFilterOptions(vehicles),
    filters,
    isFilterPanelOpen,
    isSelected: (vehicleId) => selected.has(vehicleId),
    pills: describeVehicleFilterPills(filters),
    // A ação em massa age sobre o que a tabela mostra: linha filtrada fora não entra no lote
    selectedVehicles: visible.filter((vehicle) => selected.has(vehicle.id)),
    selectionState: resolveVehicleSelectionState({ selectedIds, visibleIds }),
    setFilterPanelOpen,
    setFilters,
    sort,
    toggleAllVisible: () => setSelectedIds(toggleVisibleSelection({ selectedIds, visibleIds })),
    toggleSort: (column) => setSort(nextVehicleSortState(sort, column)),
    toggleVehicle,
    totalCount: vehicles.length,
    vehicles: visible,
  }
}
