/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { previewEmailSettingsQueryKey } from '../queries/usePreviewEmailSettings.query'
import { getPreviewEmailClient } from '../shared/previewEmailClient.service'
import type { PreviewEmailLists } from '../shared/previewEmail.types'

export function useSavePreviewEmailAllowlistsMutation(contractorId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (lists: PreviewEmailLists) =>
      getPreviewEmailClient().saveAllowlists({ contractorId, lists }),
    /** A API devolve as listas normalizadas: entram no cache da ficha sem uma segunda ida. */
    onSuccess: (settings) => {
      queryClient.setQueryData(previewEmailSettingsQueryKey(contractorId), settings)
    },
  })
}
