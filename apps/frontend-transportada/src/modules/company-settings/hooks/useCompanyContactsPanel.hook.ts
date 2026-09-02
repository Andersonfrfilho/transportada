/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createCompanyContactsClient,
  type CompanyContactSettings,
} from '../shared/companyContactsClient.service'

const COMPANY_CONTACTS_QUERY_KEY = 'company-contacts'

function getCompanyContactsClient() {
  return createCompanyContactsClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useCompanyContactsPanel(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const client = getCompanyContactsClient()
  const queryClient = useQueryClient()
  const queryKey = [COMPANY_CONTACTS_QUERY_KEY, input.companyId] as const

  const query = useQuery({
    enabled: input.enabled,
    queryFn: client.getSettings,
    queryKey,
  })
  const mutation = useMutation({
    mutationFn: (settings: CompanyContactSettings) => client.updateSettings(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { mutation, query }
}
