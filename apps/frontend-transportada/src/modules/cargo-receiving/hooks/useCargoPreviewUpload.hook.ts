/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useRef, useState } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { useUploadCargoPreviewMutation } from '../mutations/useUploadCargoPreview.mutation'
import {
  usePreviewContractors,
  type PreviewContractors,
} from '../queries/useCargoPreviewContractors.query'
import type { CargoPreviewSummary } from '../shared/cargoPreview.types'
import {
  buildPreviewUploadFingerprint,
  validatePreviewUpload,
} from '../shared/cargoPreviewUpload.validation'
import { describePreviewUploadRefusal } from '../shared/cargoPreviewRefusal.service'
import {
  resolveIdempotencyAttempt,
  type IdempotencyAttempt,
} from '../shared/cargoIdempotencyKey.service'
import type { RegistrationRefusal } from '../shared/cargoReceivingRefusal.service'
import { navigateToCargoPreviewDetail } from '../shared/cargoReceivingRoute.service'
import { useCargoFieldFeedback, type CargoFieldFeedback } from './useCargoFieldFeedback.hook'

export type CargoPreviewUploadController = Readonly<{
  contractorId: string
  contractors: PreviewContractors
  errorCode: string | undefined
  feedback: CargoFieldFeedback
  file: File | undefined
  isSubmitting: boolean
  /** A prévia que o servidor já tinha: o mesmo arquivo reenviado devolve 200, e a tela leva até ela. */
  existingPreview: CargoPreviewSummary | undefined
  openExisting: () => void
  refusal: RegistrationRefusal | undefined
  selectContractor: (contractorId: string) => void
  selectFile: (file: File | undefined) => void
  submit: () => void
}>

/**
 * O envio da planilha: validação no cliente, `Idempotency-Key` por tentativa (o MESMO envio repetido
 * reaproveita a chave; arquivo ou contratante diferente gera outra) e a recusa do servidor com os campos.
 */
export function useCargoPreviewUpload(): CargoPreviewUploadController {
  const [contractorId, setContractorId] = useState('')
  const [file, setFile] = useState<File | undefined>(undefined)
  const [refusal, setRefusal] = useState<RegistrationRefusal | undefined>(undefined)
  const [existingPreview, setExistingPreview] = useState<CargoPreviewSummary | undefined>(undefined)
  const attempt = useRef<IdempotencyAttempt | undefined>(undefined)
  const feedback = useCargoFieldFeedback()
  const contractors = usePreviewContractors()
  const mutation = useUploadCargoPreviewMutation()
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])

  function resetOutcome(field: string): void {
    feedback.clearField(field)
    setRefusal(undefined)
    setExistingPreview(undefined)
    mutation.reset()
  }

  function submit(): void {
    const issues = validatePreviewUpload({ contractorId, file })
    feedback.setIssues(issues)
    feedback.markRefused([])
    setRefusal(undefined)
    setExistingPreview(undefined)
    if (file === undefined || Object.keys(issues).length > 0) return

    attempt.current = resolveIdempotencyAttempt({
      fingerprint: buildPreviewUploadFingerprint({ contractorId, file }),
      generateKey: () => crypto.randomUUID(),
      previous: attempt.current,
    })
    mutation.mutate(
      { idempotencyKey: attempt.current.key, input: { contractorId, file } },
      {
        onError: (error) => {
          const described = describePreviewUploadRefusal(error)
          setRefusal(described)
          feedback.markRefused(described.fields.map((item) => item.field))
        },
        onSuccess: ({ isReplay, preview }) =>
          isReplay
            ? setExistingPreview(preview)
            : navigateToCargoPreviewDetail({ navigator, previewId: preview.id }),
      },
    )
  }

  return {
    contractorId,
    contractors,
    errorCode: mutation.error instanceof Error ? mutation.error.message : undefined,
    existingPreview,
    feedback,
    file,
    isSubmitting: mutation.isPending,
    openExisting: () => {
      if (existingPreview !== undefined) {
        navigateToCargoPreviewDetail({ navigator, previewId: existingPreview.id })
      }
    },
    refusal,
    selectContractor: (value) => {
      setContractorId(value)
      resetOutcome('contractorId')
    },
    selectFile: (value) => {
      setFile(value)
      resetOutcome('file')
    },
    submit,
  }
}
