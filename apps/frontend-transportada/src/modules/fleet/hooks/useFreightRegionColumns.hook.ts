/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { TableColumnStorage } from '../../shared/tableColumnPreferences.service'
import {
  readFreightRegionColumnPreferences,
  reorderFreightRegionColumns,
  writeFreightRegionColumnPreferences,
  type FreightRegionColumnKey,
  type FreightRegionColumnPreferences,
} from '../shared/freightRegionColumns.service'

export type FreightRegionColumnsController = Readonly<{
  columnPreferences: FreightRegionColumnPreferences
  hideColumn: (column: FreightRegionColumnKey, isVisible: boolean) => void
  moveColumn: (column: FreightRegionColumnKey, direction: 'down' | 'up') => void
  visibleColumns: readonly FreightRegionColumnKey[]
}>

function getColumnStorage(): TableColumnStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function useFreightRegionColumns(): FreightRegionColumnsController {
  const [columnPreferences, setColumnPreferences] = useState<FreightRegionColumnPreferences>(() =>
    readFreightRegionColumnPreferences(getColumnStorage()),
  )

  function persistColumns(preferences: FreightRegionColumnPreferences): void {
    setColumnPreferences(preferences)
    writeFreightRegionColumnPreferences({ preferences, storage: getColumnStorage() })
  }

  function hideColumn(column: FreightRegionColumnKey, isVisible: boolean): void {
    persistColumns({
      ...columnPreferences,
      visibility: { ...columnPreferences.visibility, [column]: isVisible },
    })
  }

  function moveColumn(column: FreightRegionColumnKey, direction: 'down' | 'up'): void {
    persistColumns({
      ...columnPreferences,
      order: reorderFreightRegionColumns(columnPreferences.order, column, direction),
    })
  }

  const visibleColumns = columnPreferences.order.filter(
    (column) => columnPreferences.visibility[column],
  )

  return { columnPreferences, hideColumn, moveColumn, visibleColumns }
}
