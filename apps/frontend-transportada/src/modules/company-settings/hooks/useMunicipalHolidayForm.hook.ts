/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  useCreateRuleMutation,
  useUpdateRuleMutation,
} from '../mutations/useMunicipalRules.mutation'
import {
  useSaveMunicipalHolidayMutation,
  useUpdateMunicipalHolidayMutation,
} from '../mutations/useMunicipalHolidays.mutation'
import type { HolidayRow } from '../shared/businessCalendarRows.service'
import {
  draftFromRow,
  hasMunicipalChanges,
  submitMunicipalDraft,
  type MunicipalActions,
} from '../shared/businessCalendarSubmit.service'

import { useCityOptions } from './useCityOptions.hook'
import { useHolidayDraft } from './useHolidayDraft.hook'
import type { HolidayFeedbackController } from './useHolidayFeedback.hook'

type FormInput = Readonly<{
  companyId: string | undefined
  feedback: HolidayFeedbackController
  rows: readonly HolidayRow[]
}>

/**
 * O formulário do feriado municipal e o modo de edição dele. Editar reabre a linha no mesmo formulário, com a cidade
 * e a recorrência travadas (ADR-0096 §6: a cidade da regra não se edita; a data fixa só muda nome e tipo).
 */
export function useMunicipalHolidayForm(input: FormInput) {
  const { companyId, feedback } = input
  const scope = { companyId }
  const form = useHolidayDraft({ onEdit: feedback.clear, scope: 'municipal' })
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const editing = input.rows.find((row) => row.id === editingId)
  const city = useCityOptions(form.draft.stateIbgeCode)
  const createRule = useCreateRuleMutation(scope)
  const updateRule = useUpdateRuleMutation(scope)
  const saveHoliday = useSaveMunicipalHolidayMutation(scope)
  const updateHoliday = useUpdateMunicipalHolidayMutation(scope)
  const isSaving =
    createRule.isPending || updateRule.isPending || saveHoliday.isPending || updateHoliday.isPending
  const actions: MunicipalActions = {
    createRule: createRule.mutateAsync,
    saveHoliday: saveHoliday.mutateAsync,
    updateHoliday: updateHoliday.mutateAsync,
    updateRule: updateRule.mutateAsync,
  }

  async function handleSubmit(): Promise<void> {
    if (isSaving) return
    feedback.clear()
    if (!form.validate()) return
    try {
      feedback.notify(await submitMunicipalDraft({ actions, draft: form.draft, editing }))
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
    city,
    editing,
    form,
    handleCancelEdit,
    handleEdit,
    handleSubmit,
    isSaving,
    isUnchanged: editing !== undefined && !hasMunicipalChanges({ draft: form.draft, editing }),
  }
}

export type MunicipalHolidayFormController = ReturnType<typeof useMunicipalHolidayForm>
