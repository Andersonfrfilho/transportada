/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  useCreateStateHolidayMutation,
  useUpdateStateHolidayMutation,
} from '../mutations/useStateHolidays.mutation'
import type { HolidayRow } from '../shared/businessCalendarRows.service'
import {
  draftFromRow,
  hasStateChanges,
  submitStateDraft,
  type StateActions,
} from '../shared/businessCalendarSubmit.service'

import { useHolidayDraft } from './useHolidayDraft.hook'
import type { HolidayFeedbackController } from './useHolidayFeedback.hook'

type FormInput = Readonly<{
  companyId: string | undefined
  feedback: HolidayFeedbackController
  rows: readonly HolidayRow[]
}>

/** O formulário do feriado estadual: a UF e a recorrência são a identidade da linha, então a edição as trava. */
export function useStateHolidayForm(input: FormInput) {
  const { companyId, feedback } = input
  const form = useHolidayDraft({ onEdit: feedback.clear, scope: 'state' })
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const editing = input.rows.find((row) => row.id === editingId)
  const create = useCreateStateHolidayMutation({ companyId })
  const update = useUpdateStateHolidayMutation({ companyId })
  const isSaving = create.isPending || update.isPending
  const actions: StateActions = { create: create.mutateAsync, update: update.mutateAsync }

  async function handleSubmit(): Promise<void> {
    if (isSaving) return
    feedback.clear()
    if (!form.validate()) return
    try {
      feedback.notify(await submitStateDraft({ actions, draft: form.draft, editing }))
      form.reset()
      setEditingId(undefined)
    } catch (error) {
      feedback.refuse(error)
    }
  }

  function handleEdit(row: HolidayRow): void {
    feedback.clear()
    setEditingId(row.id)
    form.reset(draftFromRow(row))
  }

  function handleCancelEdit(): void {
    setEditingId(undefined)
    form.reset()
  }

  return {
    editing,
    form,
    handleCancelEdit,
    handleEdit,
    handleSubmit,
    isSaving,
    isUnchanged: editing !== undefined && !hasStateChanges({ draft: form.draft, editing }),
  }
}

export type StateHolidayFormController = ReturnType<typeof useStateHolidayForm>
