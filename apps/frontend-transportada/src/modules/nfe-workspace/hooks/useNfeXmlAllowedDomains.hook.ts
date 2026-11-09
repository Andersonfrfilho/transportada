/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createNfeXmlAllowedDomainsClient } from '../shared/nfeXmlAllowedDomains.service'

const QUERY_KEY = 'nfe-xml-allowed-domains'

function createClient() {
  return createNfeXmlAllowedDomainsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useNfeXmlAllowedDomains(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, input.companyId] })
  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: () => createClient().list(),
    queryKey: [QUERY_KEY, input.companyId] as const,
  })
  const release = useMutation({
    mutationFn: (value: Readonly<{ contractorId: string; domain: string }>) =>
      createClient().release(value),
    onSuccess: invalidate,
  })
  const setStatus = useMutation({
    mutationFn: (value: Readonly<{ id: string; status: 'active' | 'inactive' }>) =>
      createClient().setStatus(value),
    onSuccess: invalidate,
  })
  return { query, release, setStatus }
}
