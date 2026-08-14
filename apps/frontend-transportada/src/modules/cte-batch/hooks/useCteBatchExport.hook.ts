/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { getCteBatchItemClient } from '../queries/cteBatchItems.query'
import { saveArchiveFile } from '@/modules/shared/archiveDownload.service'
import {
  buildCteBatchExportRequest,
  canExportCteBatchSelection,
  CTE_EXPORT_DEFAULT_FORMAT,
  resolveCteExportMessageKey,
  type CteExportFormat,
} from '../shared/cteBatchItemExport.service'

type UseCteBatchExportInput = Readonly<{
  permissions: readonly string[]
  selectedBatchIds: readonly string[]
}>

export function useCteBatchExport(input: UseCteBatchExportInput) {
  const [exportFormat, setExportFormat] = useState<CteExportFormat>(CTE_EXPORT_DEFAULT_FORMAT)
  const exportMutation = useMutation({
    mutationFn: async () => {
      const body = buildCteBatchExportRequest({
        format: exportFormat,
        selectedBatchIds: input.selectedBatchIds,
      })
      saveArchiveFile(await getCteBatchItemClient().exportCompanyItems(body))
    },
  })

  return {
    canExportSelection: canExportCteBatchSelection({
      permissions: input.permissions,
      selectedCount: input.selectedBatchIds.length,
    }),
    exportErrorKey: exportMutation.isError
      ? resolveCteExportMessageKey(exportMutation.error)
      : null,
    exportFormat,
    exportSelection: () => exportMutation.mutate(),
    isExporting: exportMutation.isPending,
    setExportFormat,
  }
}
