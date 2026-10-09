/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useDisableImportedHolidayMutation } from '../mutations/useHolidayImport.mutation'
import { useHolidayImportStatusQuery } from '../queries/useHolidayImport.query'
import {
  describeBusinessCalendarRefusal,
  type BusinessCalendarRefusal,
} from '../shared/businessCalendarRefusal.service'
import { canDisableHolidayOn, readCalendarToday } from '../shared/businessCalendarHorizon.service'
import type { HolidayImportRemoved } from '../shared/holidayImport.types'

import { useHolidayPlaceLabels } from './useHolidayPlaceLabels.hook'

type RemovedInput = Readonly<{ companyId: string | undefined; enabled: boolean }>

const NO_ITEMS: readonly HolidayImportRemoved[] = []

/**
 * As datas da própria empresa que o fornecedor deixou de listar. Desligar é reversível (restaurar), mas só volta no
 * ciclo seguinte: por isso o botão pergunta antes, no próprio item, e a falha fica dita no bloco.
 */
export function useHolidayImportRemoved(input: RemovedInput) {
  const query = useHolidayImportStatusQuery(input)
  const disable = useDisableImportedHolidayMutation({ companyId: input.companyId })
  const [askedId, setAskedId] = useState<string | undefined>(undefined)
  const [refusal, setRefusal] = useState<BusinessCalendarRefusal | undefined>(undefined)
  const items = query.data?.removedByProvider.items ?? NO_ITEMS
  const labelOf = useHolidayPlaceLabels(items)
  const today = readCalendarToday(new Date())

  /** Data que já passou a API não desliga (409): o botão nem aparece. */
  function canDisable(item: HolidayImportRemoved): boolean {
    return canDisableHolidayOn({ holidayOn: item.holidayOn, today })
  }

  function ask(holidayId: string): void {
    setRefusal(undefined)
    setAskedId(holidayId)
  }

  function cancel(): void {
    setAskedId(undefined)
  }

  async function confirm(item: HolidayImportRemoved): Promise<void> {
    if (disable.isPending) return
    try {
      await disable.mutateAsync({ holidayId: item.holidayId, scope: item.scope })
      setAskedId(undefined)
      setRefusal(undefined)
    } catch (error) {
      setRefusal(describeBusinessCalendarRefusal(error))
    }
  }

  return {
    ask,
    askedId,
    canDisable,
    cancel,
    confirm,
    isDisabling: disable.isPending,
    isLoaded: query.data !== undefined,
    items,
    labelOf,
    refusal,
    truncated: query.data?.removedByProvider.truncated ?? false,
  }
}

export type HolidayImportRemovedController = ReturnType<typeof useHolidayImportRemoved>
