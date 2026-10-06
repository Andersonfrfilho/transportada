/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type { OccurrenceAttachmentOverrides } from '../shared/occurrence.constant'
import { OCCURRENCE_ATTACHMENT_OVERRIDES_BATCH_QUERY_KEY } from './useOccurrenceAttachmentOverridesBatch.query'

/**
 * Spec 218 RF-B3/RF-B4, spec 246 RF11c: o `PUT` substitui as duas listas de exceção de **um** tipo; a
 * leitura é só a consulta em lote, e é ela que a gravação invalida.
 */
export function useReplaceOccurrenceAttachmentOverridesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OccurrenceAttachmentOverrides & Readonly<{ occurrenceTypeId: string }>) =>
      getTripClient().replaceOccurrenceAttachmentOverrides(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: OCCURRENCE_ATTACHMENT_OVERRIDES_BATCH_QUERY_KEY,
      })
    },
  })
}
