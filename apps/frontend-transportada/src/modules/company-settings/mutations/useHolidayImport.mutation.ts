/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  BUSINESS_CALENDAR_RESOURCE,
  invalidateBusinessCalendar,
} from '../queries/useBusinessCalendar.query'
import { getHolidayImportClient } from '../shared/businessCalendarClient.provider'
import type { HolidayImportScope } from '../shared/holidayImport.types'

type CompanyScope = Readonly<{ companyId: string | undefined }>
export type DisableImportedInput = Readonly<{ holidayId: string; scope: HolidayImportScope }>

/** Desligar apaga a linha da lista, cria uma supressão e tira a data de "removidos pelo fornecedor". */
const DISABLE_RESOURCES = [
  BUSINESS_CALENDAR_RESOURCE.HOLIDAY_IMPORT_STATUS,
  BUSINESS_CALENDAR_RESOURCE.HOLIDAY_IMPORT_SUPPRESSIONS,
  BUSINESS_CALENDAR_RESOURCE.MUNICIPAL_HOLIDAYS,
  BUSINESS_CALENDAR_RESOURCE.MUNICIPAL_RULES,
  BUSINESS_CALENDAR_RESOURCE.STATE_HOLIDAYS,
] as const

/** Restaurar só apaga a supressão: a data volta na próxima execução diária, então as listas não mudam agora. */
const RESTORE_RESOURCES = [
  BUSINESS_CALENDAR_RESOURCE.HOLIDAY_IMPORT_STATUS,
  BUSINESS_CALENDAR_RESOURCE.HOLIDAY_IMPORT_SUPPRESSIONS,
] as const

export function useDisableImportedHolidayMutation(input: CompanyScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (disable: DisableImportedInput) => getHolidayImportClient().disable(disable),
    onSettled: () =>
      invalidateBusinessCalendar({
        companyId: input.companyId,
        queryClient,
        resources: DISABLE_RESOURCES,
      }),
  })
}

export function useRestoreHolidaySuppressionMutation(input: CompanyScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (suppressionId: string) => getHolidayImportClient().restore(suppressionId),
    onSettled: () =>
      invalidateBusinessCalendar({
        companyId: input.companyId,
        queryClient,
        resources: RESTORE_RESOURCES,
      }),
  })
}
