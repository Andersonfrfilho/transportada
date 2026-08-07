/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'

import { getCteBatchItemClient } from '../queries/cteBatchItems.query'
import { saveCteArchive } from '../shared/cteArchiveDownload.service'
import {
  buildCteBatchExportRequest,
  canExportCteBatchSelection,
  resolveCteExportMessageKey,
} from '../shared/cteBatchItemExport.service'

type UseCteBatchExportInput = Readonly<{
  permissions: readonly string[]
  selectedBatchIds: readonly string[]
}>

export function useCteBatchExport(input: UseCteBatchExportInput) {
  const exportMutation = useMutation({
    mutationFn: async () => {
      const body = buildCteBatchExportRequest({ selectedBatchIds: input.selectedBatchIds })
      saveCteArchive(await getCteBatchItemClient().exportCompanyItems(body))
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
    exportSelection: () => exportMutation.mutate(),
    isExporting: exportMutation.isPending,
  }
}
