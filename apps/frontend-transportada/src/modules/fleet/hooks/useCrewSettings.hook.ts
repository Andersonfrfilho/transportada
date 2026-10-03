/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createCrewSettingsClient } from '../shared/crewSettingsClient.service'

const CREW_SETTINGS_QUERY_KEY = 'company-crew-settings'

function createClient() {
  return createCrewSettingsClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useCrewSettings(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const queryClient = useQueryClient()
  const client = createClient()
  const queryKey = [CREW_SETTINGS_QUERY_KEY, input.companyId] as const
  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: client.get,
    queryKey,
  })
  const saveMutation = useMutation({
    mutationFn: client.save,
    onSuccess(settings) {
      queryClient.setQueryData(queryKey, settings)
    },
  })

  return { query, saveMutation }
}
