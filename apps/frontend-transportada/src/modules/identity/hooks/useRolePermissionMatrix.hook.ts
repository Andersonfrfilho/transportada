/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { USERS_MANAGE_PERMISSION } from '../shared/companyUsers.constant'
import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { getCompanyUsersClient } from './useCompanyUsers.hook'

export const ROLE_PERMISSIONS_QUERY_KEY = 'company-role-permissions'

/**
 * A matriz é configuração, não movimento: ela só muda quando alguém publica versão nova do produto.
 * Por isso ela não expira sozinha — recarregar a cada foco gastaria requisição para receber
 * exatamente o mesmo corpo.
 */
export function useRolePermissionMatrix(
  input: Readonly<{
    enabled: boolean
    permissions: readonly string[]
    client?: CompanyUsersClient
  }>,
) {
  const client = input.client ?? getCompanyUsersClient()

  return useQuery({
    enabled: input.enabled && input.permissions.includes(USERS_MANAGE_PERMISSION),
    queryFn: () => client.readRolePermissions(),
    queryKey: [ROLE_PERMISSIONS_QUERY_KEY],
    staleTime: Number.POSITIVE_INFINITY,
  })
}
