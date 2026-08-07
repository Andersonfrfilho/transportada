/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { getCteBatchItemClient } from '../queries/cteBatchItems.query'
import { saveCteArchive } from '../shared/cteArchiveDownload.service'
import {
  buildCteExportRequest,
  canExportCteSelection,
  canExportCteXml,
  CTE_EXPORT_DEFAULT_FORMAT,
  resolveCteExportMessageKey,
  type CteExportFormat,
  type CteExportScope,
} from '../shared/cteBatchItemExport.service'
import type { CteItemTableFilters } from '../shared/cteBatchItemTable.service'

type UseCteItemExportInput = Readonly<{
  filters: CteItemTableFilters
  permissions: readonly string[]
  selectedCount: number
  selectedIds: readonly string[]
}>

export function useCteItemExport(input: UseCteItemExportInput) {
  const [exportFormat, setExportFormat] = useState<CteExportFormat>(CTE_EXPORT_DEFAULT_FORMAT)
  const exportMutation = useMutation({
    mutationFn: async (scope: CteExportScope) => {
      const body = buildCteExportRequest({
        filters: input.filters,
        format: exportFormat,
        scope,
        selectedIds: input.selectedIds,
      })
      saveCteArchive(await getCteBatchItemClient().exportCompanyItems(body))
    },
  })

  return {
    canExportFiltered: canExportCteXml({ permissions: input.permissions }),
    canExportSelection: canExportCteSelection({
      permissions: input.permissions,
      selectedCount: input.selectedCount,
    }),
    exportErrorKey: exportMutation.isError
      ? resolveCteExportMessageKey(exportMutation.error)
      : null,
    exportFiltered: () => exportMutation.mutate('filters'),
    exportFormat,
    exportSelection: () => exportMutation.mutate('selection'),
    isExporting: exportMutation.isPending,
    setExportFormat,
  }
}
