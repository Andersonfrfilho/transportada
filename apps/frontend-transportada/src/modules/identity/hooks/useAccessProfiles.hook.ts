/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useAuthMeQuery } from '../queries/useAuthMe.query'
import { USERS_MANAGE_PERMISSION } from '../shared/companyUsers.constant'
import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { getCompanyUsersClient } from './useCompanyUsers.hook'
import { useCompanyGroups } from './useCompanyGroups.hook'
import { useRolePermissionMatrix } from './useRolePermissionMatrix.hook'

/**
 * Quem escolher o grupo precisa escolher gente, e a listagem de acessos é paginada por cursor. Cem
 * cabe numa consulta e cobre a instalação inteira na prática; acima disso a tela **diz** que a lista
 * está cortada em vez de fingir que a empresa tem cem pessoas.
 */
const ASSIGNMENT_CANDIDATES_LIMIT = 100

export const ASSIGNMENT_CANDIDATES_QUERY_KEY = 'company-users-assignment-candidates'

export function useAccessProfiles(input: Readonly<{ client?: CompanyUsersClient }> = {}) {
  const client = input.client ?? getCompanyUsersClient()
  const authQuery = useAuthMeQuery()
  const companyId = authQuery.data?.data.company.id
  const permissions = authQuery.data?.data.permissions ?? []
  const canManageUsers = permissions.includes(USERS_MANAGE_PERMISSION)

  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<readonly string[]>([])

  const groups = useCompanyGroups({
    ...(input.client === undefined ? {} : { client: input.client }),
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })

  /** A matriz é a referência de leitura desta tela: ela abre junto, não por clique. */
  const rolePermissions = useRolePermissionMatrix({ enabled: true, permissions })

  const candidates = useQuery({
    enabled: canManageUsers && companyId !== undefined,
    queryFn: () => client.listUsers({ cursor: null, limit: ASSIGNMENT_CANDIDATES_LIMIT }),
    queryKey: [ASSIGNMENT_CANDIDATES_QUERY_KEY, companyId],
  })

  function assign(): void {
    if (selectedGroupId === '' || selectedUserIds.length === 0) return

    groups.assignMutation.mutate(
      { groupIds: [selectedGroupId], userIds: [...selectedUserIds] },
      /** Limpar antes da resposta diria "feito" com a operação ainda no ar. */
      { onSuccess: () => setSelectedUserIds([]) },
    )
  }

  return {
    assign,
    candidates,
    /** A lista veio cortada: dizer isso é o que impede procurar alguém que a consulta não trouxe. */
    hasMoreCandidates: candidates.data?.nextCursor != null,
    groups,
    rolePermissions,
    selectGroup: setSelectedGroupId,
    selectUsers: setSelectedUserIds,
    selectedGroupId,
    selectedUserIds,
  }
}
