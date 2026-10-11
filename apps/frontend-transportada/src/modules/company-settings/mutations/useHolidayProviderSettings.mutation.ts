/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

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

type SaveVariables = Omit<SaveHolidayProviderSettingsInput, 'token'>

/**
 * A resposta do `PUT` é a configuração gravada e entra no cache direto. No 409 a versão ficou velha: relê, para a tela
 * mostrar o que o outro administrador gravou em vez de insistir na versão antiga.
 *
 * ⚠️ A chave em claro NÃO é variável da mutação: o React Query guarda `state.variables` por 5 minutos no cache de
 * mutações. Ela passa por um `ref` que a `mutationFn` lê e zera no `finally`, e `mutateAsync` já recebe o corpo sem ela.
 */
export function useSaveHolidayProviderSettingsMutation(input: CompanyScope) {
  const queryClient = useQueryClient()
  const pendingToken = useRef<string | undefined>(undefined)
  const mutation = useMutation({
    mutationFn: async (save: SaveVariables) => {
      const token = pendingToken.current
      try {
        const body = token === undefined ? save : { ...save, token }
        return await getHolidayProviderSettingsClient().saveSettings(body)
      } finally {
        pendingToken.current = undefined
      }
    },
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

  function saveSettings(body: SaveHolidayProviderSettingsInput) {
    const { token, ...variables } = body
    if (token !== undefined) pendingToken.current = token
    return mutation.mutateAsync(variables)
  }

  return { ...mutation, saveSettings }
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
