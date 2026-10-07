/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useUpdateContractorMutation } from '../mutations/useUpdateContractor.mutation'
import {
  createContractorDetailsDraft,
  toContractorWrite,
  validateContractorDetailsDraft,
  type ContractorDetailsDraft,
} from '../shared/contractorDetails.validation'
import type { Contractor } from '../shared/contractorDirectory.types'
import { describeRefusedFields } from '../shared/receivingRefusal.service'
import { useFieldFeedback, type FieldFeedback } from './useFieldFeedback.hook'

export type ContractorDetailsFormController = Readonly<{
  draft: ContractorDetailsDraft
  errorCode: string | undefined
  feedback: FieldFeedback
  isSaved: boolean
  isSaving: boolean
  setField: <TField extends keyof ContractorDetailsDraft>(
    field: TField,
    value: ContractorDetailsDraft[TField],
  ) => void
  submit: () => void
}>

export function useContractorDetailsForm(contractor: Contractor): ContractorDetailsFormController {
  const mutation = useUpdateContractorMutation(contractor.id)
  const feedback = useFieldFeedback()
  const [draft, setDraft] = useState(() => createContractorDetailsDraft(contractor))

  function submit(): void {
    const issues = validateContractorDetailsDraft(draft)
    feedback.setIssues(issues)
    feedback.markRefused([])
    if (Object.keys(issues).length > 0) return
    mutation.mutate(toContractorWrite(draft), {
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
    setField: (field, value) => {
      setDraft({ ...draft, [field]: value })
      feedback.clearField(field)
      mutation.reset()
    },
    submit,
  }
}
