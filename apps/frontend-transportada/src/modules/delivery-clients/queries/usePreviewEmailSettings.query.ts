/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getPreviewEmailClient } from '../shared/previewEmailClient.service'
import { CONTRACTOR_DIRECTORY_QUERY_KEY } from './useContractorDirectory.query'

export function previewEmailSettingsQueryKey(contractorId: string) {
  return [CONTRACTOR_DIRECTORY_QUERY_KEY, 'preview-email', contractorId, 'settings'] as const
}

/** As listas e se há endereço ativo — nunca o token, que só existe na resposta de quem gerou. */
export function usePreviewEmailSettingsQuery(contractorId: string) {
  return useQuery({
    queryFn: () => getPreviewEmailClient().getSettings(contractorId),
    queryKey: previewEmailSettingsQueryKey(contractorId),
  })
}
