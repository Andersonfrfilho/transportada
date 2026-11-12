/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createDriverStopReminderClient } from '../shared/driverStopReminderClient.service'
import type { DriverStopReminderBody } from '../shared/driverStopReminder.validation'

const DRIVER_STOP_REMINDER_QUERY_KEY = 'company-driver-stop-reminders'

function getDriverStopReminderClient() {
  return createDriverStopReminderClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/** Spec 299 RF19: liga a consulta só com a aba "Cobrança do motorista" aberta. */
export function useDriverStopReminderPanel(
  input: Readonly<{ companyId?: string; enabled: boolean }>,
) {
  const client = getDriverStopReminderClient()
  const queryClient = useQueryClient()
  const queryKey = [DRIVER_STOP_REMINDER_QUERY_KEY, input.companyId] as const

  const query = useQuery({ enabled: input.enabled, queryFn: client.get, queryKey })
  const saveMutation = useMutation({
    mutationFn: (body: DriverStopReminderBody) => client.save(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { query, saveMutation }
}
