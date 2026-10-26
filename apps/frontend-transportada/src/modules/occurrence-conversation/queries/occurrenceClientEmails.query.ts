/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { readOccurrenceClientEmails } from '../shared/occurrenceClientEmails.service'

export const OCCURRENCE_CLIENT_EMAILS_QUERY_KEY = 'occurrence-client-emails'

/** Spec 279 T6c: os e-mails guardados do cliente da nota; sem CNPJ/CPF não há o que ler. */
export function useOccurrenceClientEmailsQuery(input: Readonly<{ taxId: string }>) {
  return useQuery({
    enabled: input.taxId.replaceAll(/\D/gu, '').length > 0,
    queryFn: () => readOccurrenceClientEmails(input.taxId),
    queryKey: [OCCURRENCE_CLIENT_EMAILS_QUERY_KEY, input.taxId],
    retry: false,
  })
}
