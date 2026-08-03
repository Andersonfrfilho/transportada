/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'

import { getCteBatchItemClient } from '../queries/cteBatchItems.query'
import type { CteItemExportFile } from '../shared/cteBatchItemClient.service'
import {
  buildCteExportRequest,
  canExportCteSelection,
  canExportCteXml,
  resolveCteExportMessageKey,
  type CteExportScope,
} from '../shared/cteBatchItemExport.service'
import type { CteItemTableFilters } from '../shared/cteBatchItemTable.service'

type UseCteItemExportInput = Readonly<{
  filters: CteItemTableFilters
  permissions: readonly string[]
  selectedCount: number
  selectedIds: readonly string[]
}>

/** O ZIP chega como blob: sem âncora temporária o navegador abriria binário na aba. */
function saveArchive(file: CteItemExportFile): void {
  if (typeof document === 'undefined') return
  const objectUrl = URL.createObjectURL(file.blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = file.fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export function useCteItemExport(input: UseCteItemExportInput) {
  const exportMutation = useMutation({
    mutationFn: async (scope: CteExportScope) => {
      const body = buildCteExportRequest({
        filters: input.filters,
        scope,
        selectedIds: input.selectedIds,
      })
      saveArchive(await getCteBatchItemClient().exportCompanyItems(body))
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
    exportSelection: () => exportMutation.mutate('selection'),
    isExporting: exportMutation.isPending,
  }
}
