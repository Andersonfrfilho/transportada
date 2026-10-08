/* Copyright (c) 2026 Ada Technology. MIT License. */
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import { useDebouncedValue } from '../hooks/useDebouncedValue.hook'
import {
  hasOccurrenceMailProblems,
  readOccurrenceMailProblems,
  type OccurrenceMailDraft,
} from '../shared/occurrenceMailDraft.service'
import { OCCURRENCE_MAIL_PREVIEW_DEBOUNCE_MS } from '../shared/occurrenceMailTemplate.constant'

export const OCCURRENCE_TYPE_EMAIL_PREVIEW_QUERY_KEY = [
  'trip',
  'occurrence-type-email-preview',
] as const

/**
 * Spec 247 RF4: a prévia é do servidor — a mesma função do envio, com dados de exemplo fixos. Cada
 * texto assenta separado depois da pausa na digitação, e o anterior segue na tela enquanto o novo chega.
 * `enabled` fica falso com marcador desconhecido: o servidor só devolveria a recusa.
 */
export function useOccurrenceTypeEmailPreview(
  input: Readonly<{ draft: OccurrenceMailDraft; isEnabled: boolean }>,
) {
  const emailBody = useDebouncedValue(input.draft.emailBody, OCCURRENCE_MAIL_PREVIEW_DEBOUNCE_MS)
  const emailItemLineTemplate = useDebouncedValue(
    input.draft.emailItemLineTemplate,
    OCCURRENCE_MAIL_PREVIEW_DEBOUNCE_MS,
  )
  const emailSubject = useDebouncedValue(
    input.draft.emailSubject,
    OCCURRENCE_MAIL_PREVIEW_DEBOUNCE_MS,
  )

  /** O texto que assentou pode ainda ser o errado, mesmo com o digitado já corrigido: o servidor só devolveria a recusa. */
  const settled = { emailBody, emailItemLineTemplate, emailSubject }
  const isSettledValid = !hasOccurrenceMailProblems(readOccurrenceMailProblems(settled))

  return useQuery({
    enabled: input.isEnabled && isSettledValid,
    placeholderData: keepPreviousData,
    queryFn: () => getTripClient().previewOccurrenceTypeEmail(settled),
    queryKey: [
      ...OCCURRENCE_TYPE_EMAIL_PREVIEW_QUERY_KEY,
      emailSubject,
      emailBody,
      emailItemLineTemplate,
    ] as const,
    retry: false,
    staleTime: Infinity,
  })
}
