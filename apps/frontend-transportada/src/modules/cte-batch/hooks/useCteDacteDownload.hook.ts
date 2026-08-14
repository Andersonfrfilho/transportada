/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'

import { getCteBatchItemClient } from '../queries/cteBatchItems.query'
import { saveArchiveFile } from '@/modules/shared/archiveDownload.service'
import {
  canDownloadCteDacte,
  resolveCteExportMessageKey,
} from '../shared/cteBatchItemExport.service'

type UseCteDacteDownloadInput = Readonly<{
  permissions: readonly string[]
}>

type DacteTarget = Readonly<{
  accessKey: null | string
  batchId: string
  id: string
  status: string
}>

export function useCteDacteDownload(input: UseCteDacteDownloadInput) {
  const downloadMutation = useMutation({
    mutationFn: async (target: DacteTarget) => {
      const file = await getCteBatchItemClient().downloadItemDacte({
        batchId: target.batchId,
        itemId: target.id,
      })
      saveArchiveFile(file)
    },
  })

  return {
    canDownloadDacte: (target: DacteTarget) =>
      canDownloadCteDacte({
        accessKey: target.accessKey,
        permissions: input.permissions,
        status: target.status,
      }),
    dacteErrorKey: downloadMutation.isError
      ? resolveCteExportMessageKey(downloadMutation.error)
      : null,
    downloadDacte: (target: DacteTarget) => downloadMutation.mutate(target),
    // Só a linha em curso trava: as outras continuam clicáveis enquanto um PDF é desenhado.
    downloadingDacteId: downloadMutation.isPending
      ? (downloadMutation.variables?.id ?? null)
      : null,
  }
}
