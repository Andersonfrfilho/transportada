/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { CompanyUser } from '../shared/companyUsers.types'
import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { getCompanyUsersClient } from './useCompanyUsers.hook'

export const USER_PERMISSIONS_QUERY_KEY = 'company-user-permissions'

/**
 * A permissão avulsa é lida por pessoa, só quando o diálogo dela abre: carregar junto da listagem
 * seria uma consulta por linha para mostrar o que quase ninguém tem.
 */
export function useUserPermissions(input: Readonly<{ client?: CompanyUsersClient }> = {}) {
  const client = input.client ?? getCompanyUsersClient()
  const [target, setTarget] = useState<CompanyUser | null>(null)
  const queryClient = useQueryClient()

  function invalidate(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: [USER_PERMISSIONS_QUERY_KEY] })
  }

  const query = useQuery({
    enabled: target !== null,
    queryFn: () => client.listUserPermissions({ userId: target?.id ?? '' }),
    queryKey: [USER_PERMISSIONS_QUERY_KEY, target?.id],
  })

  const grantMutation = useMutation({
    mutationFn: (permissions: readonly string[]) =>
      client.grantPermissions({ permissions, userId: target?.id ?? '' }),
    onSuccess: invalidate,
  })

  const revokeMutation = useMutation({
    mutationFn: (permission: string) =>
      client.revokePermissions({ permissions: [permission], userId: target?.id ?? '' }),
    onSuccess: invalidate,
  })

  return {
    close: () => setTarget(null),
    grantMutation,
    open: setTarget,
    query,
    revokeMutation,
    target,
  }
}
