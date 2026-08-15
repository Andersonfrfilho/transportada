/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { TableColumnStorage } from '../../shared/tableColumnPreferences.service'
import {
  readFleetVehicleColumnPreferences,
  reorderFleetVehicleColumns,
  writeFleetVehicleColumnPreferences,
  type FleetVehicleColumnKey,
  type FleetVehicleColumnPreferences,
} from '../shared/fleetVehicleTable.service'

export type VehicleColumnsController = Readonly<{
  columnPreferences: FleetVehicleColumnPreferences
  hideColumn: (column: FleetVehicleColumnKey, isVisible: boolean) => void
  moveColumn: (column: FleetVehicleColumnKey, direction: 'down' | 'up') => void
  visibleColumns: readonly FleetVehicleColumnKey[]
}>

function getColumnStorage(): TableColumnStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function useVehicleColumns(): VehicleColumnsController {
  const [columnPreferences, setColumnPreferences] = useState<FleetVehicleColumnPreferences>(() =>
    readFleetVehicleColumnPreferences(getColumnStorage()),
  )

  function persistColumns(preferences: FleetVehicleColumnPreferences): void {
    setColumnPreferences(preferences)
    writeFleetVehicleColumnPreferences({ preferences, storage: getColumnStorage() })
  }

  function hideColumn(column: FleetVehicleColumnKey, isVisible: boolean): void {
    persistColumns({
      ...columnPreferences,
      visibility: { ...columnPreferences.visibility, [column]: isVisible },
    })
  }

  function moveColumn(column: FleetVehicleColumnKey, direction: 'down' | 'up'): void {
    persistColumns({
      ...columnPreferences,
      order: reorderFleetVehicleColumns(columnPreferences.order, column, direction),
    })
  }

  const visibleColumns = columnPreferences.order.filter(
    (column) => columnPreferences.visibility[column],
  )

  return { columnPreferences, hideColumn, moveColumn, visibleColumns }
}
