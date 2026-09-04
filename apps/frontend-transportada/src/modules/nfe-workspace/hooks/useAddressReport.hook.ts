/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createNfeWorkspaceClient } from '../shared/nfeWorkspaceClient.service'

const ADDRESS_REPORT_QUERY_KEY = 'address-report'

/**
 * O relatório só é buscado com a aba aberta **e** com `settings.manage` — a rota exige a permissão,
 * e pedi-la sem ela renderiza o erro em cima de uma aba que a pessoa nem escolheu abrir.
 */
export function useAddressReport(
  input: Readonly<{ companyId?: string | undefined; enabled: boolean }>,
) {
  const client = createNfeWorkspaceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })

  return useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: () => client.getAddressReport(),
    queryKey: [ADDRESS_REPORT_QUERY_KEY, input.companyId] as const,
  })
}
