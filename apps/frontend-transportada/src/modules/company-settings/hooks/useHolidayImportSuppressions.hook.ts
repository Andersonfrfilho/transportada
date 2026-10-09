/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useRestoreHolidaySuppressionMutation } from '../mutations/useHolidayImport.mutation'
import { useHolidayImportSuppressionsQuery } from '../queries/useHolidayImport.query'
import {
  describeBusinessCalendarRefusal,
  type BusinessCalendarRefusal,
} from '../shared/businessCalendarRefusal.service'
import {
  HOLIDAY_IMPORT_FIRST_PAGE,
  HOLIDAY_IMPORT_SUPPRESSIONS_PER_PAGE,
} from '../shared/holidayImport.constant'
import type { HolidayImportSuppression } from '../shared/holidayImport.types'

import { useHolidayPlaceLabels } from './useHolidayPlaceLabels.hook'

type SuppressionsInput = Readonly<{ companyId: string | undefined; enabled: boolean }>

const NO_ITEMS: readonly HolidayImportSuppression[] = []

/**
 * As datas que o operador desligou, uma página por vez. Restaurar apaga a supressão; a data volta na próxima execução
 * diária, não na hora — por isso o aviso de sucesso diz isso, e a lista não ganha a linha de volta.
 */
export function useHolidayImportSuppressions(input: SuppressionsInput) {
  const [page, setPage] = useState(HOLIDAY_IMPORT_FIRST_PAGE)
  const query = useHolidayImportSuppressionsQuery({ ...input, page })
  const restore = useRestoreHolidaySuppressionMutation({ companyId: input.companyId })
  const [isRestored, setIsRestored] = useState(false)
  const [refusal, setRefusal] = useState<BusinessCalendarRefusal | undefined>(undefined)
  const items = query.data?.items ?? NO_ITEMS
  const total = query.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / HOLIDAY_IMPORT_SUPPRESSIONS_PER_PAGE))
  const labelOf = useHolidayPlaceLabels(items)

  function goToPage(next: number): void {
    setIsRestored(false)
    setPage(next)
  }

  async function handleRestore(suppression: HolidayImportSuppression): Promise<void> {
    if (restore.isPending) return
    setIsRestored(false)
    setRefusal(undefined)
    try {
      await restore.mutateAsync(suppression.id)
      setIsRestored(true)
      if (items.length === 1 && page > HOLIDAY_IMPORT_FIRST_PAGE) setPage(page - 1)
    } catch (error) {
      setRefusal(describeBusinessCalendarRefusal(error))
    }
  }

  return {
    error: query.error,
    goToPage,
    handleRestore,
    isError: query.isError,
    isLoading: query.isPending,
    isRestored,
    isRestoring: restore.isPending,
    items,
    labelOf,
    page,
    pageCount,
    refetch: () => void query.refetch(),
    refusal,
    total,
  }
}

export type HolidayImportSuppressionsController = ReturnType<typeof useHolidayImportSuppressions>
