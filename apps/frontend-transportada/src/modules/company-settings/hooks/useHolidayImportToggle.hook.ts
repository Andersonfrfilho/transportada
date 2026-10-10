/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useSaveHolidayImportEnablementMutation } from '../mutations/useHolidayProviderSettings.mutation'
import { useHolidayImportEnablementQuery } from '../queries/useHolidayProviderSettings.query'
import {
  describeBusinessCalendarRefusal,
  type BusinessCalendarRefusal,
} from '../shared/businessCalendarRefusal.service'

type ToggleInput = Readonly<{ companyId: string | undefined; enabled: boolean }>

/**
 * O liga/desliga da importação da empresa. A caixa mostra o valor pedido enquanto grava e volta ao gravado se o servidor
 * recusar — a recusa é dita, nunca muda a caixa. Sem linha gravada a importação vem ligada (`origin: 'default'`).
 */
export function useHolidayImportToggle(input: ToggleInput) {
  const query = useHolidayImportEnablementQuery(input)
  const mutation = useSaveHolidayImportEnablementMutation({ companyId: input.companyId })
  const [refusal, setRefusal] = useState<BusinessCalendarRefusal | undefined>(undefined)
  const stored = query.data?.isEnabled
  const isChecked = mutation.isPending ? mutation.variables : stored

  async function handleToggle(checked: boolean): Promise<void> {
    setRefusal(undefined)
    try {
      await mutation.mutateAsync(checked)
    } catch (error) {
      setRefusal(describeBusinessCalendarRefusal(error))
    }
  }

  return {
    handleToggle,
    isChecked: isChecked ?? true,
    isSaved: mutation.isSuccess,
    isSaving: mutation.isPending,
    query,
    refusal,
  }
}
