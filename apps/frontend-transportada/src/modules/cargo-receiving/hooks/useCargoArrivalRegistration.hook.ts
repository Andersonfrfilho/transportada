/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useRef, useState } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { useRegisterCargoArrivalMutation } from '../mutations/useRegisterCargoArrival.mutation'
import {
  useEnabledContractors,
  type EnabledContractors,
} from '../queries/useCargoContractors.query'
import {
  createArrivalDraft,
  toRegisterArrivalInput,
  validateArrivalDraft,
  type ArrivalDraft,
} from '../shared/cargoArrivalForm.validation'
import {
  buildRegistrationFingerprint,
  resolveIdempotencyAttempt,
  type IdempotencyAttempt,
} from '../shared/cargoIdempotencyKey.service'
import {
  describeRegistrationRefusal,
  type RegistrationRefusal,
} from '../shared/cargoReceivingRefusal.service'
import { navigateToCargoArrivalDetail } from '../shared/cargoReceivingRoute.service'
import {
  useAvailableDocumentPicker,
  type AvailableDocumentPickerController,
} from './useAvailableDocumentPicker.hook'
import { useCargoFieldFeedback, type CargoFieldFeedback } from './useCargoFieldFeedback.hook'

/** Data e hora são dois campos na tela e um só no servidor: editar qualquer um limpa o erro dele. */
const FIELD_OF_DRAFT: Readonly<Record<keyof ArrivalDraft, string>> = {
  contractorId: 'contractorId',
  date: 'arrivedAt',
  palletCount: 'palletCount',
  reference: 'reference',
  time: 'arrivedAt',
}

export type CargoArrivalRegistrationController = Readonly<{
  contractors: EnabledContractors
  draft: ArrivalDraft
  errorCode: string | undefined
  feedback: CargoFieldFeedback
  isSubmitting: boolean
  picker: AvailableDocumentPickerController
  refusal: RegistrationRefusal | undefined
  setDraftField: (field: keyof ArrivalDraft, value: string) => void
  submit: () => void
}>

export function useCargoArrivalRegistration(): CargoArrivalRegistrationController {
  const [draft, setDraft] = useState<ArrivalDraft>(() => createArrivalDraft(new Date()))
  const [refusal, setRefusal] = useState<RegistrationRefusal | undefined>(undefined)
  const attempt = useRef<IdempotencyAttempt | undefined>(undefined)
  const feedback = useCargoFieldFeedback()
  const contractors = useEnabledContractors()
  const picker = useAvailableDocumentPicker(draft.contractorId)
  const mutation = useRegisterCargoArrivalMutation()
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])

  function setDraftField(field: keyof ArrivalDraft, value: string): void {
    setDraft((current) => ({ ...current, [field]: value }))
    feedback.clearField(FIELD_OF_DRAFT[field])
    setRefusal(undefined)
    mutation.reset()
  }

  function submit(): void {
    const requested = [...picker.selection.values()]
    const issues = validateArrivalDraft({ documentCount: requested.length, draft, now: new Date() })
    feedback.setIssues(issues)
    feedback.markRefused([])
    setRefusal(undefined)
    if (Object.keys(issues).length > 0) return

    const input = toRegisterArrivalInput({
      documentIds: requested.map((document) => document.id),
      draft,
    })
    attempt.current = resolveIdempotencyAttempt({
      fingerprint: buildRegistrationFingerprint(input),
      generateKey: () => crypto.randomUUID(),
      previous: attempt.current,
    })
    mutation.mutate(
      { idempotencyKey: attempt.current.key, input },
      {
        onError: (error) => {
          const described = describeRegistrationRefusal({
            error,
            requestedDocuments: requested.map(({ id, number }) => ({ id, number })),
          })
          setRefusal(described)
          feedback.markRefused(described.fields.map((item) => item.field))
        },
        onSuccess: ({ arrival }) =>
          navigateToCargoArrivalDetail({ arrivalId: arrival.id, navigator }),
      },
    )
  }

  return {
    contractors,
    draft,
    errorCode: mutation.error instanceof Error ? mutation.error.message : undefined,
    feedback,
    isSubmitting: mutation.isPending,
    picker,
    refusal,
    setDraftField,
    submit,
  }
}
