/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { useCompanyUsersQuery } from '@/modules/identity/queries/useCompanyUsers.query'

import type { MembershipChoice } from '../shared/driverMembership.service'
import { buildDriverMembershipChoices } from '../shared/driverMembership.service'

const USERS_MANAGE_PERMISSION = 'users.manage'

export type DriverMembershipsController = Readonly<{
  canReadUsers: boolean
  choices: readonly MembershipChoice[]
  isLoading: boolean
}>

/**
 * O único consumidor abaixo de página de `useAuthMeQuery`: o cadastro rápido de motorista abre de
 * dentro do formulário de veículo, e levar permissão até lá atravessaria a cadeia inteira do veículo
 * para um campo só. A consulta é a mesma chave em cache — ler duas vezes não custa duas requisições.
 */
export function useDriverMemberships(
  input: Readonly<{ selected: string }>,
): DriverMembershipsController {
  const authQuery = useAuthMeQuery()
  const canReadUsers = (authQuery.data?.data.permissions ?? []).includes(USERS_MANAGE_PERMISSION)
  const usersQuery = useCompanyUsersQuery({ enabled: canReadUsers })

  return {
    canReadUsers,
    choices: buildDriverMembershipChoices({
      selected: input.selected,
      users: usersQuery.data ?? [],
    }),
    isLoading: authQuery.isPending || (canReadUsers && usersQuery.isPending),
  }
}
