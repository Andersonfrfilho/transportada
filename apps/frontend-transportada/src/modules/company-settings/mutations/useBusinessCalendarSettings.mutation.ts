/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { getBusinessCalendarClient } from '../shared/businessCalendarClient.provider'
import {
  BUSINESS_CALENDAR_RESOURCE,
  businessCalendarQueryKey,
} from '../queries/useBusinessCalendar.query'

/** A resposta do `PUT` é a configuração gravada: ela entra no cache direto, sem a volta que piscaria o valor antigo. */
export function useSaveSaturdayMutation(input: Readonly<{ companyId: string | undefined }>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (saturdayIsBusinessDay: boolean) =>
      getBusinessCalendarClient().saveSettings(saturdayIsBusinessDay),
    onSuccess: (settings) => {
      queryClient.setQueryData(
        businessCalendarQueryKey({
          companyId: input.companyId,
          resource: BUSINESS_CALENDAR_RESOURCE.SETTINGS,
        }),
        settings,
      )
    },
  })
}
