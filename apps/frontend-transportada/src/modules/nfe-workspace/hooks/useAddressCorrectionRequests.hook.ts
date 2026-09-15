/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createNfeWorkspaceClient } from '../shared/nfeWorkspaceClient.service'
import { ADDRESS_CORRECTION_REQUESTS_QUERY_KEY } from '../shared/nfeWorkspace.constant'

/**
 * A lista de pedidos de correção por endereço (spec 150, T202) — mesma chave que
 * `useAddressCorrectionForm` invalida ao salvar. Falhar aqui não derruba a aba: o selo de estado
 * some da linha, o resto do relatório continua utilizável.
 */
export function useAddressCorrectionRequests(
  input: Readonly<{ companyId?: string | undefined; enabled: boolean }>,
) {
  const client = createNfeWorkspaceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })

  return useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: () => client.listAddressCorrectionRequests(),
    queryKey: [ADDRESS_CORRECTION_REQUESTS_QUERY_KEY, input.companyId] as const,
  })
}
