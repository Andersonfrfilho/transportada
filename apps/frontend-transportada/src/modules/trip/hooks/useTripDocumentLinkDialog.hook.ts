/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import {
  buildLinkDocumentsAfterDispatchInput,
  resolveDocumentLinkBlocker,
  resolveDocumentLinkErrorKey,
  resolveDocumentLinkOutcome,
  type DocumentLinkErrorKey,
  type DocumentLinkOutcome,
} from '../shared/tripDocumentLink.service'
import type { LinkDocumentsAfterDispatchResult } from '../shared/tripDocumentLink.types'

export type TripDocumentLinkDialogInput = Readonly<{
  isOpen: boolean
  onSubmit: (
    input: Readonly<{ nfeDocumentIds: readonly string[]; reason: string }>,
  ) => Promise<LinkDocumentsAfterDispatchResult>
  tripId: string
}>

/** Spec 257 T2.2: estado do diálogo "Acrescentar notas". Reabre limpo; depois do envio guarda o resumo. */
export function useTripDocumentLinkDialog(input: TripDocumentLinkDialogInput) {
  const [nfeDocumentIds, setNfeDocumentIds] = useState<readonly string[]>([])
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<DocumentLinkErrorKey | undefined>(undefined)
  const [outcome, setOutcome] = useState<DocumentLinkOutcome | undefined>(undefined)

  useEffect(() => {
    if (!input.isOpen) return
    setNfeDocumentIds([])
    setReason('')
    setErrorKey(undefined)
    setOutcome(undefined)
  }, [input.isOpen, input.tripId])

  const blocker = resolveDocumentLinkBlocker({ nfeDocumentIds, reason })

  async function submit(): Promise<boolean> {
    if (blocker !== undefined) return false
    setErrorKey(undefined)
    setIsSubmitting(true)
    try {
      const { nfeDocumentIds: nextIds, reason: nextReason } = buildLinkDocumentsAfterDispatchInput({
        nfeDocumentIds,
        reason,
        tripId: input.tripId,
      })
      const result = await input.onSubmit({ nfeDocumentIds: nextIds, reason: nextReason })
      setOutcome(resolveDocumentLinkOutcome(result.link))
      return true
    } catch (error) {
      setErrorKey(resolveDocumentLinkErrorKey(error))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    blocker,
    canSubmit: blocker === undefined && !isSubmitting,
    errorKey,
    isSubmitting,
    nfeDocumentIds,
    outcome,
    reason,
    setNfeDocumentIds,
    setReason,
    submit,
  }
}
