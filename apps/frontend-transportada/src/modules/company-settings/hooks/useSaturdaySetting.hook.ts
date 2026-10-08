/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useSaveSaturdayMutation } from '../mutations/useBusinessCalendarSettings.mutation'
import { useBusinessCalendarSettingsQuery } from '../queries/useBusinessCalendar.query'
import {
  describeBusinessCalendarRefusal,
  type BusinessCalendarRefusal,
} from '../shared/businessCalendarRefusal.service'

type SaturdayInput = Readonly<{ companyId: string | undefined; enabled: boolean }>

/**
 * "Sábado é dia útil" (RF5): sem linha gravada a leitura devolve `false` com origem `default`. O interruptor mostra
 * o valor pedido enquanto grava e volta ao gravado se o servidor recusar — a recusa é dita, nunca muda.
 */
export function useSaturdaySetting(input: SaturdayInput) {
  const query = useBusinessCalendarSettingsQuery(input)
  const mutation = useSaveSaturdayMutation({ companyId: input.companyId })
  const [refusal, setRefusal] = useState<BusinessCalendarRefusal | undefined>(undefined)
  const stored = query.data?.saturdayIsBusinessDay
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
    isChecked: isChecked ?? false,
    isSaved: mutation.isSuccess,
    isSaving: mutation.isPending,
    origin: query.data?.origin,
    query,
    refusal,
  }
}

export type SaturdaySettingController = ReturnType<typeof useSaturdaySetting>
