/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getHolidayImportClient } from '../shared/businessCalendarClient.provider'
import { HOLIDAY_IMPORT_SUPPRESSIONS_PER_PAGE } from '../shared/holidayImport.constant'
import type {
  HolidayImportStatus,
  HolidayImportSuppressionsPage,
} from '../shared/holidayImport.types'

import { BUSINESS_CALENDAR_RESOURCE, businessCalendarQueryKey } from './useBusinessCalendar.query'

type CompanyQuery = Readonly<{ companyId: string | undefined; enabled: boolean }>

/** O que a rotina deixou: lido ao abrir a aba e quando uma ação muda a lista (desligar, restaurar, editar). */
export function useHolidayImportStatusQuery(input: CompanyQuery) {
  return useQuery<HolidayImportStatus>({
    enabled: input.enabled,
    queryFn: () => getHolidayImportClient().getStatus(),
    queryKey: businessCalendarQueryKey({
      companyId: input.companyId,
      resource: BUSINESS_CALENDAR_RESOURCE.HOLIDAY_IMPORT_STATUS,
    }),
  })
}

/** Uma página por vez, como a API: a chave leva a página, e invalidar o recurso refaz a página aberta. */
export function useHolidayImportSuppressionsQuery(
  input: CompanyQuery & Readonly<{ page: number }>,
) {
  return useQuery<HolidayImportSuppressionsPage>({
    enabled: input.enabled,
    queryFn: () =>
      getHolidayImportClient().listSuppressions({
        page: input.page,
        perPage: HOLIDAY_IMPORT_SUPPRESSIONS_PER_PAGE,
      }),
    queryKey: [
      ...businessCalendarQueryKey({
        companyId: input.companyId,
        resource: BUSINESS_CALENDAR_RESOURCE.HOLIDAY_IMPORT_SUPPRESSIONS,
      }),
      input.page,
    ],
  })
}
