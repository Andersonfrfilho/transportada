/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createLandingPanelClient,
  type LandingSettingsUpdate,
} from '../shared/landingPanelClient.service'

const LANDING_SETTINGS_QUERY_KEY = 'landing-settings'

function getLandingPanelClient() {
  return createLandingPanelClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useLandingSettingsPanel(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const client = getLandingPanelClient()
  const queryClient = useQueryClient()
  const queryKey = [LANDING_SETTINGS_QUERY_KEY, input.companyId] as const

  const query = useQuery({
    enabled: input.enabled,
    queryFn: client.getSettings,
    queryKey,
  })
  const mutation = useMutation({
    mutationFn: (update: LandingSettingsUpdate) => client.updateSettings(update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { mutation, query }
}
