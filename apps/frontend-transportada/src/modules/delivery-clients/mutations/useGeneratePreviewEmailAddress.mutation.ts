/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { previewEmailSettingsQueryKey } from '../queries/usePreviewEmailSettings.query'
import { getPreviewEmailClient } from '../shared/previewEmailClient.service'

/**
 * ⚠️ `gcTime: 0`: o token vive na resposta desta mutação, e o cache de mutações guardaria o resultado por
 * minutos depois de a tela largá-lo. Sem observador, o resultado sai do cache na hora.
 */
export function useGeneratePreviewEmailAddressMutation(contractorId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    gcTime: 0,
    mutationFn: () => getPreviewEmailClient().generateAddress(contractorId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: previewEmailSettingsQueryKey(contractorId) }),
  })
}
