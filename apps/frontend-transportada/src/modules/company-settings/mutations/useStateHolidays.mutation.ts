/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { StateHolidayChanges, StateHolidayFields } from '../shared/businessCalendar.types'
import { getBusinessCalendarClient } from '../shared/businessCalendarClient.provider'
import {
  BUSINESS_CALENDAR_RESOURCE,
  invalidateBusinessCalendar,
} from '../queries/useBusinessCalendar.query'

type CompanyScope = Readonly<{ companyId: string | undefined }>

/** Feriado estadual não é materializado nem lido pelo roteiro: só a própria lista muda. */
function useStateInvalidation(input: CompanyScope): () => Promise<void> {
  const queryClient = useQueryClient()
  return () =>
    invalidateBusinessCalendar({
      companyId: input.companyId,
      queryClient,
      resources: [BUSINESS_CALENDAR_RESOURCE.STATE_HOLIDAYS],
    })
}

export function useCreateStateHolidayMutation(input: CompanyScope) {
  const invalidate = useStateInvalidation(input)
  return useMutation({
    mutationFn: (fields: StateHolidayFields) =>
      getBusinessCalendarClient().createStateHoliday(fields),
    onSuccess: invalidate,
  })
}

export function useUpdateStateHolidayMutation(input: CompanyScope) {
  const invalidate = useStateInvalidation(input)
  return useMutation({
    mutationFn: (update: Readonly<{ changes: StateHolidayChanges; id: string }>) =>
      getBusinessCalendarClient().updateStateHoliday(update),
    onSettled: invalidate,
  })
}

export function useDeleteStateHolidayMutation(input: CompanyScope) {
  const invalidate = useStateInvalidation(input)
  return useMutation({
    mutationFn: (id: string) => getBusinessCalendarClient().deleteStateHoliday(id),
    onSettled: invalidate,
  })
}
