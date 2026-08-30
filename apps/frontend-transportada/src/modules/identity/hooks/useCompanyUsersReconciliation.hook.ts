/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { USERS_MANAGE_PERMISSION } from '../shared/companyUsers.constant'
import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { getCompanyUsersClient } from './useCompanyUsers.hook'

export const COMPANY_USERS_RECONCILIATION_QUERY_KEY = 'company-users-reconciliation'

/**
 * A comparação entre a nossa base e o realm do Keycloak. Ela é consulta própria e não entra na
 * listagem: a listagem é a operação do dia a dia, e a divergência é conserto — misturar as duas
 * faria toda tela de usuários carregar o realm inteiro para mostrar duas linhas.
 */
export function useCompanyUsersReconciliation(
  input: Readonly<{
    enabled: boolean
    permissions: readonly string[]
    client?: CompanyUsersClient
    companyId?: string
  }>,
) {
  const client = input.client ?? getCompanyUsersClient()
  const canManageUsers = input.permissions.includes(USERS_MANAGE_PERMISSION)

  return useQuery({
    enabled: input.enabled && canManageUsers && input.companyId !== undefined,
    queryFn: () => client.reconcileUsers(),
    queryKey: [COMPANY_USERS_RECONCILIATION_QUERY_KEY, input.companyId],
    /** O realm não muda a cada foco: recarregar é clique, não respiração da tela. */
    staleTime: 60_000,
  })
}
