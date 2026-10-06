import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type { OccurrenceAttachmentOverridesByType } from '../shared/occurrence.constant'

/** Invalidada por toda gravação de exceção: a lista em lote e a de um tipo contam o mesmo fato. */
export const OCCURRENCE_ATTACHMENT_OVERRIDES_BATCH_QUERY_KEY = [
  'trip',
  'occurrence-attachment-overrides',
  'batch',
] as const

/**
 * Spec 246 RF11c: as exceções de **todos** os tipos numa consulta só — uma por tela, nunca uma por
 * linha. API anterior à rota responde 404 e o cliente devolve lista vazia: o catálogo segue editável.
 */
export function useOccurrenceAttachmentOverridesBatchQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<OccurrenceAttachmentOverridesByType>({
    enabled: input.enabled,
    queryFn: () => getTripClient().listOccurrenceAttachmentOverridesBatch(),
    queryKey: OCCURRENCE_ATTACHMENT_OVERRIDES_BATCH_QUERY_KEY,
  })
}
