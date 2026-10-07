/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getPreviewEmailClient } from '../shared/previewEmailClient.service'
import { CONTRACTOR_DIRECTORY_QUERY_KEY } from './useContractorDirectory.query'

/** As recusas recentes são diagnóstico ("o e-mail não chegou, por quê?"): vêm lidas da ficha aberta. */
export function usePreviewEmailIntakesQuery(contractorId: string) {
  return useQuery({
    queryFn: () => getPreviewEmailClient().listIntakes(contractorId),
    queryKey: [CONTRACTOR_DIRECTORY_QUERY_KEY, 'preview-email', contractorId, 'intakes'] as const,
  })
}
