/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { GROUPS_MANAGE_PERMISSION } from '../shared/companyUsers.constant'
import type { AssignCompanyGroupsInput, SaveCompanyGroupInput } from '../shared/companyUsers.types'
import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { getCompanyUsersClient } from './useCompanyUsers.hook'

export const COMPANY_GROUPS_QUERY_KEY = 'company-groups'

/**
 * Os grupos são poucos e mudam pouco — é cadastro, não movimento. A consulta só liga com
 * `groups.manage`: sem a permissão a API responde 403, e pedir para receber recusa é gastar
 * requisição para pintar um erro que a tela já sabe evitar.
 */
export function useCompanyGroups(
  input: Readonly<{
    permissions: readonly string[]
    client?: CompanyUsersClient
    companyId?: string
  }>,
) {
  const client = input.client ?? getCompanyUsersClient()
  const canManageGroups = input.permissions.includes(GROUPS_MANAGE_PERMISSION)
  const queryClient = useQueryClient()

  function invalidate(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: [COMPANY_GROUPS_QUERY_KEY] })
  }

  const query = useQuery({
    enabled: canManageGroups && input.companyId !== undefined,
    queryFn: () => client.listGroups(),
    queryKey: [COMPANY_GROUPS_QUERY_KEY, input.companyId],
  })

  const saveMutation = useMutation({
    mutationFn: (group: SaveCompanyGroupInput) => client.saveGroup(group),
    onSuccess: invalidate,
  })

  const removeMutation = useMutation({
    mutationFn: (groupId: string) => client.removeGroup({ groupId }),
    onSuccess: invalidate,
  })

  /** Atribuir mexe no que a pessoa alcança: a lista de usuários precisa ser relida junto. */
  const assignMutation = useMutation({
    mutationFn: (assignment: AssignCompanyGroupsInput) => client.assignGroups(assignment),
    onSuccess: invalidate,
  })

  return { assignMutation, canManageGroups, query, removeMutation, saveMutation }
}
