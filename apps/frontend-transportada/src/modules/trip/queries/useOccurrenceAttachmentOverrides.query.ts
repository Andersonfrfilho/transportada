/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type { OccurrenceAttachmentOverrides } from '../shared/occurrence.constant'
import { OCCURRENCE_ATTACHMENT_OVERRIDES_BATCH_QUERY_KEY } from './useOccurrenceAttachmentOverridesBatch.query'

const OCCURRENCE_ATTACHMENT_OVERRIDES_QUERY_KEY = (occurrenceTypeId: string) =>
  ['trip', 'occurrence-attachment-overrides', occurrenceTypeId] as const

/**
 * Spec 218 RF-B3/RF-B4: as duas listas de exceção do `attachmentMode` de **um** tipo — só busca
 * quando a seção "Exceções" daquele tipo está aberta (`enabled`), para não somar N consultas ao
 * abrir o catálogo inteiro.
 */
export function useOccurrenceAttachmentOverridesQuery(
  input: Readonly<{ enabled: boolean; occurrenceTypeId: string }>,
) {
  return useQuery<OccurrenceAttachmentOverrides>({
    enabled: input.enabled,
    queryFn: () => getTripClient().listOccurrenceAttachmentOverrides(input),
    queryKey: OCCURRENCE_ATTACHMENT_OVERRIDES_QUERY_KEY(input.occurrenceTypeId),
  })
}

export function useReplaceOccurrenceAttachmentOverridesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OccurrenceAttachmentOverrides & Readonly<{ occurrenceTypeId: string }>) =>
      getTripClient().replaceOccurrenceAttachmentOverrides(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: OCCURRENCE_ATTACHMENT_OVERRIDES_QUERY_KEY(variables.occurrenceTypeId),
      })
      void queryClient.invalidateQueries({
        queryKey: OCCURRENCE_ATTACHMENT_OVERRIDES_BATCH_QUERY_KEY,
      })
    },
  })
}
