/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  useRemoveHolidayProviderTokenMutation,
  useSaveHolidayProviderSettingsMutation,
} from '../mutations/useHolidayProviderSettings.mutation'
import {
  describeBusinessCalendarRefusal,
  type BusinessCalendarRefusal,
} from '../shared/businessCalendarRefusal.service'
import type { SaveHolidayProviderSettingsInput } from '../shared/holidayProviderSettings.types'

type ActionsInput = Readonly<{ companyId: string | undefined }>

/**
 * As gravações do bloco da chave. Vivem acima do formulário de propósito: o formulário remonta quando a versão muda
 * (é isso que o faz abrir sem a chave e com o valor gravado), e o aviso de "salvo", a recusa e a confirmação de remover
 * precisam atravessar essa remontagem.
 */
export function useHolidayProviderActions(input: ActionsInput) {
  const saveMutation = useSaveHolidayProviderSettingsMutation(input)
  const removeMutation = useRemoveHolidayProviderTokenMutation(input)
  const [refusal, setRefusal] = useState<BusinessCalendarRefusal | undefined>(undefined)
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false)

  function dismissFeedback(): void {
    saveMutation.reset()
    removeMutation.reset()
    setRefusal(undefined)
  }

  /** Devolve o campo que a recusa nomeou primeiro, para a tela levar o foco até ele. */
  async function save(body: SaveHolidayProviderSettingsInput): Promise<string | undefined> {
    dismissFeedback()
    try {
      await saveMutation.saveSettings(body)
      return undefined
    } catch (error) {
      const described = describeBusinessCalendarRefusal(error)
      setRefusal(described)
      return described.fields[0]?.field
    }
  }

  async function removeToken(): Promise<void> {
    dismissFeedback()
    try {
      await removeMutation.mutateAsync()
    } catch (error) {
      setRefusal(describeBusinessCalendarRefusal(error))
    }
    setIsConfirmingRemoval(false)
  }

  return {
    askRemoval: () => setIsConfirmingRemoval(true),
    cancelRemoval: () => setIsConfirmingRemoval(false),
    dismissFeedback,
    isConfirmingRemoval,
    isRemoved: removeMutation.isSuccess,
    isRemoving: removeMutation.isPending,
    isSaved: saveMutation.isSuccess,
    isSaving: saveMutation.isPending,
    refusal,
    removeToken,
    save,
  }
}

export type HolidayProviderActions = ReturnType<typeof useHolidayProviderActions>
