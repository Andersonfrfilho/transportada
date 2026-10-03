/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useSaveReceivingProfileMutation } from '../mutations/useSaveReceivingProfile.mutation'
import {
  createReceivingProfileDraft,
  toReceivingProfileRules,
  type ReceivingProfileDraft,
} from '../shared/receivingProfileDraft.service'
import { validateReceivingProfileDraft } from '../shared/receivingProfile.validation'
import type { PreviewItemField, ReceivingProfile } from '../shared/receivingProfile.types'
import { describeRefusedFields } from '../shared/receivingRefusal.service'
import { useFieldFeedback, type FieldFeedback } from './useFieldFeedback.hook'

const COLUMN_FIELD_PREFIX = 'previewColumnMap.'

type ReceivingProfileFormParams = Readonly<{
  contractorId: string
  profile: ReceivingProfile | null
}>

export type ReceivingProfileFormController = Readonly<{
  draft: ReceivingProfileDraft
  errorCode: string | undefined
  feedback: FieldFeedback
  isSaved: boolean
  isSaving: boolean
  setColumn: (field: PreviewItemField, value: string) => void
  setField: <TField extends keyof Omit<ReceivingProfileDraft, 'previewColumnMap'>>(
    field: TField,
    value: ReceivingProfileDraft[TField],
  ) => void
  submit: () => void
}>

export function useReceivingProfileForm({
  contractorId,
  profile,
}: ReceivingProfileFormParams): ReceivingProfileFormController {
  const mutation = useSaveReceivingProfileMutation(contractorId)
  const feedback = useFieldFeedback()
  const [draft, setDraft] = useState(() => createReceivingProfileDraft(profile))

  function edit(next: ReceivingProfileDraft, field: string): void {
    setDraft(next)
    feedback.clearField(field)
    mutation.reset()
  }

  function submit(): void {
    const issues = validateReceivingProfileDraft(draft)
    feedback.setIssues(issues)
    feedback.markRefused([])
    if (Object.keys(issues).length > 0) return
    mutation.mutate(toReceivingProfileRules(draft), {
      onError: (error) =>
        feedback.markRefused(describeRefusedFields(error).map((item) => item.field)),
    })
  }

  return {
    draft,
    errorCode: mutation.error instanceof Error ? mutation.error.message : undefined,
    feedback,
    isSaved: mutation.isSuccess,
    isSaving: mutation.isPending,
    setColumn: (field, value) =>
      edit(
        { ...draft, previewColumnMap: { ...draft.previewColumnMap, [field]: value } },
        `${COLUMN_FIELD_PREFIX}${field}`,
      ),
    setField: (field, value) => edit({ ...draft, [field]: value }, field),
    submit,
  }
}
