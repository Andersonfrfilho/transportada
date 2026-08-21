/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { COMPANY_USERS_PAGE_SIZE } from '../shared/companyUsers.constant'
import {
  createCompanyUsersClient,
  type CompanyUsersClient,
} from '../shared/companyUsersClient.service'
import { getIdentityEnvironment } from '../shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '../shared/KeycloakAuthProvider.provider'

export const COMPANY_USERS_QUERY_KEY = 'company-users'

export function getCompanyUsersClient(): CompanyUsersClient {
  return createCompanyUsersClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: () => crypto.randomUUID(),
  })
}

/**
 * A empresa entra na chave porque o vínculo é dela: trocar de empresa sem isso mostraria a lista
 * anterior enquanto a nova carrega.
 */
export function useCompanyUsersQuery(
  input: Readonly<{
    cursor: null | string
    enabled: boolean
    client?: CompanyUsersClient
    companyId?: string
    limit?: number
  }>,
) {
  const client = input.client ?? getCompanyUsersClient()
  const limit = input.limit ?? COMPANY_USERS_PAGE_SIZE

  return useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: () => client.listUsers({ cursor: input.cursor, limit }),
    queryKey: [COMPANY_USERS_QUERY_KEY, input.companyId, input.cursor, limit] as const,
  })
}
