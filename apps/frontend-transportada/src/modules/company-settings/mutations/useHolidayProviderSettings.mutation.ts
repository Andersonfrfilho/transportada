/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  BUSINESS_CALENDAR_RESOURCE,
  businessCalendarQueryKey,
  invalidateBusinessCalendar,
} from '../queries/useBusinessCalendar.query'
import { getHolidayProviderSettingsClient } from '../shared/businessCalendarClient.provider'
import { BusinessCalendarRequestError } from '../shared/businessCalendarRequest.service'
import { HOLIDAY_PROVIDER_VERSION_CONFLICT_CODE } from '../shared/holidayProviderSettings.constant'
import type { SaveHolidayProviderSettingsInput } from '../shared/holidayProviderSettings.types'

type CompanyScope = Readonly<{ companyId: string | undefined }>

const SETTINGS_RESOURCES = [BUSINESS_CALENDAR_RESOURCE.HOLIDAY_PROVIDER_SETTINGS] as const

/** Ligar ou desligar muda a manchete do cartão de status ("desligada para esta empresa"). */
const ENABLEMENT_RESOURCES = [BUSINESS_CALENDAR_RESOURCE.HOLIDAY_IMPORT_STATUS] as const

/**
 * A resposta do `PUT` é a configuração gravada e entra no cache direto. No 409 a versão ficou velha: relê, para a tela
 * mostrar o que o outro administrador gravou em vez de insistir na versão antiga.
 */
export function useSaveHolidayProviderSettingsMutation(input: CompanyScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (save: SaveHolidayProviderSettingsInput) =>
      getHolidayProviderSettingsClient().saveSettings(save),
    onError: (error) => {
      if (
        !(error instanceof BusinessCalendarRequestError) ||
        error.code !== HOLIDAY_PROVIDER_VERSION_CONFLICT_CODE
      ) {
        return
      }
      void invalidateBusinessCalendar({
        companyId: input.companyId,
        queryClient,
        resources: SETTINGS_RESOURCES,
      })
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(
        businessCalendarQueryKey({
          companyId: input.companyId,
          resource: BUSINESS_CALENDAR_RESOURCE.HOLIDAY_PROVIDER_SETTINGS,
        }),
        settings,
      )
    },
  })
}

/** O `DELETE` é 204 sem corpo: a configuração nova (sem chave, versão acima) vem da releitura. */
export function useRemoveHolidayProviderTokenMutation(input: CompanyScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getHolidayProviderSettingsClient().removeToken(),
    onSuccess: () =>
      invalidateBusinessCalendar({
        companyId: input.companyId,
        queryClient,
        resources: SETTINGS_RESOURCES,
      }),
  })
}

export function useSaveHolidayImportEnablementMutation(input: CompanyScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (isEnabled: boolean) =>
      getHolidayProviderSettingsClient().saveEnablement(isEnabled),
    onSuccess: (enablement) => {
      queryClient.setQueryData(
        businessCalendarQueryKey({
          companyId: input.companyId,
          resource: BUSINESS_CALENDAR_RESOURCE.HOLIDAY_IMPORT_ENABLEMENT,
        }),
        enablement,
      )
      void invalidateBusinessCalendar({
        companyId: input.companyId,
        queryClient,
        resources: ENABLEMENT_RESOURCES,
      })
    },
  })
}
