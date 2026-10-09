/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  MunicipalHolidayChanges,
  MunicipalHolidayFields,
} from '../shared/businessCalendar.types'
import { getBusinessCalendarClient } from '../shared/businessCalendarClient.provider'
import {
  BUSINESS_CALENDAR_RESOURCE,
  invalidateBusinessCalendar,
} from '../queries/useBusinessCalendar.query'

type CompanyScope = Readonly<{ companyId: string | undefined }>

/**
 * A data digitada muda a lista de datas e a contagem "datas digitadas no dia da regra" (`typedHolidaysKept`), que
 * vem da leitura das regras. Editar e apagar reconciliam também na falha: o 409 de data gerada quer dizer que a
 * lista estava velha. Apagar uma digitada também a suprime da importação, e adotar uma importada a tira de
 * "removidos pelo fornecedor": o estado da importação e a lista de desligados mudam junto (spec 252).
 */
const HOLIDAY_RESOURCES = [
  BUSINESS_CALENDAR_RESOURCE.HOLIDAY_IMPORT_STATUS,
  BUSINESS_CALENDAR_RESOURCE.HOLIDAY_IMPORT_SUPPRESSIONS,
  BUSINESS_CALENDAR_RESOURCE.MUNICIPAL_HOLIDAYS,
  BUSINESS_CALENDAR_RESOURCE.MUNICIPAL_RULES,
] as const

function useHolidayInvalidation(input: CompanyScope): () => Promise<void> {
  const queryClient = useQueryClient()
  return () =>
    invalidateBusinessCalendar({
      companyId: input.companyId,
      queryClient,
      resources: HOLIDAY_RESOURCES,
    })
}

export function useSaveMunicipalHolidayMutation(input: CompanyScope) {
  const invalidate = useHolidayInvalidation(input)
  return useMutation({
    mutationFn: (fields: MunicipalHolidayFields) =>
      getBusinessCalendarClient().saveMunicipalHoliday(fields),
    onSuccess: invalidate,
  })
}

export function useUpdateMunicipalHolidayMutation(input: CompanyScope) {
  const invalidate = useHolidayInvalidation(input)
  return useMutation({
    mutationFn: (update: Readonly<{ changes: MunicipalHolidayChanges; id: string }>) =>
      getBusinessCalendarClient().updateMunicipalHoliday(update),
    onSettled: invalidate,
  })
}

export function useDeleteMunicipalHolidayMutation(input: CompanyScope) {
  const invalidate = useHolidayInvalidation(input)
  return useMutation({
    mutationFn: (id: string) => getBusinessCalendarClient().deleteMunicipalHoliday(id),
    onSettled: invalidate,
  })
}
