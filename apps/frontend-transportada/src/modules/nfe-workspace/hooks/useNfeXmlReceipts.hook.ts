/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createNfeXmlReceiptsClient } from '../shared/nfeXmlReceipts.service'

const NFE_XML_RECEIPTS_QUERY_KEY = 'nfe-xml-receipts'
const REFRESH_MS = 30_000

export function useNfeXmlReceipts(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const client = createNfeXmlReceiptsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
  return useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: () => client.list(),
    queryKey: [NFE_XML_RECEIPTS_QUERY_KEY, input.companyId] as const,
    refetchInterval: REFRESH_MS,
  })
}
