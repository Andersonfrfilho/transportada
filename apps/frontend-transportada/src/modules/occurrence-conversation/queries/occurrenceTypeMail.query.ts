/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getOccurrenceTypeMailClient } from '../shared/occurrenceTypeMailClient.provider'

export const OCCURRENCE_TYPE_MAIL_QUERY_KEY = 'occurrence-type-mail'

/** Os modelos do módulo de notificação que o tipo pode escolher, com o que os torna (ou não) utilizáveis. */
export function useContractorMailTemplateChoicesQuery(input: Readonly<{ enabled: boolean }>) {
  const client = getOccurrenceTypeMailClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.listTemplates(),
    queryKey: [OCCURRENCE_TYPE_MAIL_QUERY_KEY, 'templates'],
  })
}

/** Os contatos das contratantes do tipo que podem ser destinatários; só com escopo `listed`. */
export function useOccurrenceTypeRecipientCandidatesQuery(
  input: Readonly<{ contractorIds: readonly string[]; enabled: boolean }>,
) {
  const client = getOccurrenceTypeMailClient()
  return useQuery({
    enabled: input.enabled && input.contractorIds.length > 0,
    queryFn: () => client.listRecipientCandidates({ contractorIds: input.contractorIds }),
    queryKey: [OCCURRENCE_TYPE_MAIL_QUERY_KEY, 'recipient-candidates', ...input.contractorIds],
  })
}
