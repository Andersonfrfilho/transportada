/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import { useRegisterCargoOccurrenceMutation } from '../mutations/useRegisterCargoOccurrence.mutation'
import {
  resolveIdempotencyAttempt,
  type IdempotencyAttempt,
} from '../shared/cargoIdempotencyKey.service'
import type { ReceivingOccurrenceType } from '../shared/cargoOccurrence.types'
import {
  buildOccurrenceFingerprint,
  buildOccurrenceFormData,
  validateOccurrenceDraft,
  type OccurrenceDraft,
} from '../shared/cargoOccurrenceForm.validation'
import { describeOccurrenceRefusal } from '../shared/cargoOccurrenceRefusal.service'
import type { RegistrationRefusal } from '../shared/cargoReceivingRefusal.service'
import type { CargoFieldFeedback } from './useCargoFieldFeedback.hook'

type OccurrenceSubmissionInput = Readonly<{
  arrivalId: string
  documentId: string
  feedback: CargoFieldFeedback
  onSaved: () => void
}>

export type OccurrenceSubmissionController = Readonly<{
  errorCode: string | undefined
  isSubmitting: boolean
  refusal: RegistrationRefusal | undefined
  submit: (
    input: Readonly<{ draft: OccurrenceDraft; type: ReceivingOccurrenceType | undefined }>,
  ) => void
}>

/**
 * O envio da avaria. A chave de idempotência é UMA por tentativa: o MESMO envio repetido (rede que caiu, duplo
 * toque) a reaproveita e o servidor devolve a ocorrência já gravada; conteúdo novo ganha chave nova — a mesma
 * chave com outro pedido seria o 409 de reuso.
 */
export function useOccurrenceSubmission(
  input: OccurrenceSubmissionInput,
): OccurrenceSubmissionController {
  const { documentId, feedback } = input
  const [refusal, setRefusal] = useState<RegistrationRefusal | undefined>(undefined)
  const attempt = useRef<IdempotencyAttempt | undefined>(undefined)
  const mutation = useRegisterCargoOccurrenceMutation(input.arrivalId)

  function submit({ draft, type }: Parameters<OccurrenceSubmissionController['submit']>[0]): void {
    const issues = validateOccurrenceDraft({ draft, type })
    feedback.setIssues(issues)
    feedback.markRefused([])
    setRefusal(undefined)
    if (Object.keys(issues).length > 0) return

    attempt.current = resolveIdempotencyAttempt({
      fingerprint: buildOccurrenceFingerprint({ documentId, draft }),
      generateKey: () => crypto.randomUUID(),
      previous: attempt.current,
    })
    mutation.mutate(
      { documentId, form: buildOccurrenceFormData({ draft }), idempotencyKey: attempt.current.key },
      {
        onError: (error) => {
          const described = describeOccurrenceRefusal(error)
          setRefusal(described)
          feedback.markRefused(described.fields.map((item) => item.field))
        },
        onSuccess: input.onSaved,
      },
    )
  }

  return {
    errorCode: mutation.error instanceof Error ? mutation.error.message : undefined,
    isSubmitting: mutation.isPending,
    refusal,
    submit,
  }
}
