/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getHolidayProviderSettingsClient } from '../shared/businessCalendarClient.provider'
import type {
  HolidayImportEnablement,
  HolidayProviderSettings,
} from '../shared/holidayProviderSettings.types'

import { BUSINESS_CALENDAR_RESOURCE, businessCalendarQueryKey } from './useBusinessCalendar.query'

type CompanyQuery = Readonly<{ companyId: string | undefined; enabled: boolean }>

/**
 * A configuração da instalação (a chave nunca vem: só se há uma e a dica). O bloco da chave e o cartão de status leem
 * a MESMA chave de consulta, então a tela faz uma só ida à rede.
 */
export function useHolidayProviderSettingsQuery(input: CompanyQuery) {
  return useQuery<HolidayProviderSettings>({
    enabled: input.enabled,
    queryFn: () => getHolidayProviderSettingsClient().getSettings(),
    queryKey: businessCalendarQueryKey({
      companyId: input.companyId,
      resource: BUSINESS_CALENDAR_RESOURCE.HOLIDAY_PROVIDER_SETTINGS,
    }),
  })
}

/** O liga/desliga da importação da empresa: sem linha, ligada e `origin: 'default'`. */
export function useHolidayImportEnablementQuery(input: CompanyQuery) {
  return useQuery<HolidayImportEnablement>({
    enabled: input.enabled,
    queryFn: () => getHolidayProviderSettingsClient().getEnablement(),
    queryKey: businessCalendarQueryKey({
      companyId: input.companyId,
      resource: BUSINESS_CALENDAR_RESOURCE.HOLIDAY_IMPORT_ENABLEMENT,
    }),
  })
}
