/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createDriverAllowanceClient } from '../shared/driverAllowanceClient.service'

const DRIVER_ALLOWANCE_QUERY_KEY = 'company-driver-allowance'

function getDriverAllowanceClient() {
  return createDriverAllowanceClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/** Spec 143 D7: liga a consulta só com a aba "Diária do motorista" aberta. */
export function useDriverAllowancePanel(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const client = getDriverAllowanceClient()
  const queryClient = useQueryClient()
  const queryKey = [DRIVER_ALLOWANCE_QUERY_KEY, input.companyId] as const

  const query = useQuery({ enabled: input.enabled, queryFn: client.get, queryKey })
  const saveMutation = useMutation({
    mutationFn: (amount: string) => client.save(amount),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const clearMutation = useMutation({
    mutationFn: () => client.clear(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { clearMutation, query, saveMutation }
}
